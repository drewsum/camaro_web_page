// Headless engine-sim renderer.
//
//   es-render <script.mr> dyno <out_dir> <rpm list> <throttle> <seconds>
//       Holds the engine on the dyno at each rpm with the given throttle and
//       writes <out_dir>/<rpm>_<throttle>.wav plus a torque/power line per rpm.
//   es-render <script.mr> program <out.wav> <file>
//       Free-running engine driven by a throttle program: lines of
//       "<time_s> <throttle 0..1> [starter 0|1]", linearly interpolated.
//
// Runs physics in fixed 1/60 s frames and renders the synthesizer on the same
// thread, so output is deterministic and independent of wall-clock speed.

#include "../scripting/include/compiler.h"
#include "../include/engine.h"
#include "../include/simulator.h"
#include "../include/units.h"

#include <cmath>
#include <cstdlib>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

static const int SR = 44100;

static bool readWav16(const std::string &path, std::vector<int16_t> &out) {
    std::ifstream f(path, std::ios::binary);
    if (!f) return false;
    char id[4];
    uint32_t sz;
    f.read(id, 4); f.read((char *)&sz, 4); f.read(id, 4);
    uint16_t channels = 1, bits = 16;
    while (f.read(id, 4)) {
        f.read((char *)&sz, 4);
        if (!std::strncmp(id, "fmt ", 4)) {
            std::vector<char> b(sz);
            f.read(b.data(), sz);
            std::memcpy(&channels, b.data() + 2, 2);
            std::memcpy(&bits, b.data() + 14, 2);
        }
        else if (!std::strncmp(id, "data", 4)) {
            std::vector<int16_t> d(sz / 2);
            f.read((char *)d.data(), sz);
            out.clear();
            for (size_t i = 0; i < d.size(); i += channels) out.push_back(d[i]);
            return bits == 16;
        }
        else f.seekg(sz + (sz & 1), std::ios::cur);
    }
    return false;
}

static void writeWav16(const std::string &path, const std::vector<int16_t> &s) {
    std::ofstream f(path, std::ios::binary);
    uint32_t data = (uint32_t)s.size() * 2, riff = 36 + data, fmt = 16, rate = SR, bps = SR * 2;
    uint16_t pcm = 1, ch = 1, align = 2, bits = 16;
    f.write("RIFF", 4); f.write((char *)&riff, 4); f.write("WAVE", 4);
    f.write("fmt ", 4); f.write((char *)&fmt, 4); f.write((char *)&pcm, 2); f.write((char *)&ch, 2);
    f.write((char *)&rate, 4); f.write((char *)&bps, 4); f.write((char *)&align, 2); f.write((char *)&bits, 2);
    f.write("data", 4); f.write((char *)&data, 4); f.write((const char *)s.data(), data);
}

struct Rig {
    Engine *engine = nullptr;
    Vehicle *vehicle = nullptr;
    Transmission *transmission = nullptr;
    Simulator *sim = nullptr;

    bool load(const char *script) {
        es_script::Compiler compiler;
        compiler.initialize();
        if (!compiler.compile(script)) {
            std::fprintf(stderr, "compile failed (see error_log.log)\n");
            return false;
        }
        es_script::Compiler::Output out = compiler.execute();
        compiler.destroy();
        engine = out.engine; vehicle = out.vehicle; transmission = out.transmission;
        if (engine == nullptr) { std::fprintf(stderr, "no engine\n"); return false; }
        if (vehicle == nullptr) {
            Vehicle::Parameters p;
            p.mass = units::mass(1600, units::kg);
            p.diffRatio = 3.73;
            p.tireRadius = units::distance(13, units::inch);
            p.dragCoefficient = 0.35;
            p.crossSectionArea = units::distance(6.0, units::foot) * units::distance(5.0, units::foot);
            p.rollingResistance = 2000.0;
            vehicle = new Vehicle; vehicle->initialize(p);
        }
        if (transmission == nullptr) {
            static const double ratios[] = { 2.20, 1.64, 1.28, 1.00 };
            Transmission::Parameters p;
            p.GearCount = 4; p.GearRatios = ratios;
            p.MaxClutchTorque = units::torque(1000.0, units::ft_lb);
            transmission = new Transmission; transmission->initialize(p);
        }
        sim = engine->createSimulator(vehicle, transmission);
        engine->calculateDisplacement();
        sim->setSimulationFrequency((int)engine->getSimulationFrequency());
        Synthesizer::AudioParameters ap = sim->synthesizer().getAudioParameters();
        ap.inputSampleNoise = (float)engine->getInitialJitter();
        ap.airNoise = (float)engine->getInitialNoise();
        ap.dF_F_mix = (float)engine->getInitialHighFrequencyGain();
        // Fixed gain instead of the auto-leveler, so throttle, coast and rpm
        // keep their real loudness differences.
        if (const char *g = std::getenv("ES_GAIN")) {
            ap.volume = std::stof(g);
            sim->synthesizer().m_levelingFilter.p_minLevel = 1.0f;
            sim->synthesizer().m_levelingFilter.p_maxLevel = 1.0f;
        }
        sim->synthesizer().setAudioParameters(ap);
        for (int i = 0; i < engine->getExhaustSystemCount(); ++i) {
            ImpulseResponse *ir = engine->getExhaustSystem(i)->getImpulseResponse();
            std::vector<int16_t> d;
            if (!readWav16(ir->getFilename(), d)) {
                std::fprintf(stderr, "can't read IR %s\n", ir->getFilename().c_str());
                return false;
            }
            sim->synthesizer().initializeImpulseResponse(d.data(), (unsigned)d.size(), (float)ir->getVolume(), i);
        }
        sim->synthesizer().m_run = false; // rendered on this thread instead
        engine->getIgnitionModule()->m_enabled = true;
        std::fprintf(stderr, "%s: %.1f ci, sim %d Hz\n", engine->getName().c_str(),
            units::convert(engine->getDisplacement(), units::cubic_inches), sim->getSimulationFrequency());
        return true;
    }

    // One 1/60 s frame; appends the audio it produced to `audio`.
    void frame(std::vector<int16_t> *audio) {
        sim->startFrame(1 / 60.0);
        while (sim->simulateStep()) {}
        sim->endFrame();
        sim->synthesizer().renderAudio();
        int16_t buf[4096];
        int n = sim->readAudioOutput(4096, buf);
        if (audio) audio->insert(audio->end(), buf, buf + n);
    }
};

static std::vector<double> parseList(const std::string &s) {
    std::vector<double> v; std::stringstream ss(s); std::string t;
    while (std::getline(ss, t, ',')) v.push_back(std::stod(t));
    return v;
}

int main(int argc, char **argv) {
    if (argc < 3) { std::fprintf(stderr, "usage: see source\n"); return 1; }
    Rig rig;
    if (!rig.load(argv[1])) return 1;
    std::string mode = argv[2];

    if (mode == "dyno" && argc >= 7) {
        std::string dir = argv[3];
        std::vector<double> rpms = parseList(argv[4]);
        double throttle = std::stod(argv[5]), seconds = std::stod(argv[6]);
        // Start on the starter first: the dyno picks its direction from the
        // crank's current velocity, so engaging it at rest spins the engine
        // backwards.
        rig.sim->m_starterMotor.m_enabled = true;
        for (int i = 0; i < 90; ++i) rig.frame(nullptr);
        rig.sim->m_starterMotor.m_enabled = false;
        rig.engine->setSpeedControl(throttle);
        rig.sim->m_dyno.m_enabled = true;
        rig.sim->m_dyno.m_hold = true;
        rig.sim->m_dyno.m_rotationSpeed = units::rpm(rpms[0]);
        for (double rpm : rpms) {
            rig.sim->m_dyno.m_rotationSpeed = units::rpm(rpm);
            for (int i = 0; i < 90; ++i) rig.frame(nullptr); // settle 1.5 s
            std::vector<int16_t> audio;
            double tq = 0; int n = 0;
            for (int i = 0; i < (int)(seconds * 60); ++i) {
                rig.frame(&audio);
                tq += rig.sim->getFilteredDynoTorque(); ++n;
            }
            tq /= n;
            const double ftlb = units::convert(tq, units::ft_lb);
            std::printf("%5.0f rpm  thr %.2f  %7.1f ft-lb  %6.1f hp  measured %5.0f rpm\n", rpm, throttle,
                ftlb, ftlb * rpm / 5252.0, rig.engine->getRpm());
            std::fflush(stdout);
            char name[256];
            std::snprintf(name, sizeof name, "%s/%05.0f_%03.0f.wav", dir.c_str(), rpm, throttle * 100);
            writeWav16(name, audio);
        }
        return 0;
    }

    if (mode == "program" && argc >= 5) {
        struct Key { double t, thr, starter; };
        std::vector<Key> keys;
        std::ifstream f(argv[4]); std::string line;
        while (std::getline(f, line)) {
            std::stringstream ss(line); Key k{0, 0, 0};
            if (ss >> k.t >> k.thr) { ss >> k.starter; keys.push_back(k); }
        }
        if (keys.empty()) return 1;
        const double end = keys.back().t;
        std::vector<int16_t> audio;
        FILE *log = std::fopen((std::string(argv[3]) + ".rpm.txt").c_str(), "w");
        for (double t = 0; t < end; t += 1 / 60.0) {
            size_t i = 0;
            while (i + 1 < keys.size() && keys[i + 1].t <= t) ++i;
            double thr = keys[i].thr;
            if (i + 1 < keys.size()) {
                double a = (t - keys[i].t) / (keys[i + 1].t - keys[i].t);
                thr = keys[i].thr + (keys[i + 1].thr - keys[i].thr) * a;
            }
            rig.engine->setSpeedControl(thr);
            rig.sim->m_starterMotor.m_enabled = keys[i].starter > 0.5;
            rig.frame(&audio);
            std::fprintf(log, "%.4f %.3f %.0f\n", t, thr, rig.engine->getRpm());
        }
        std::fclose(log);
        writeWav16(argv[3], audio);
        return 0;
    }
    std::fprintf(stderr, "bad args\n");
    return 1;
}
