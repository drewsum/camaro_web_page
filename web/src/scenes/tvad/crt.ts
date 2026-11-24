import { ShaderMaterial, Vector2, type Texture } from "three";

// The picture tube of a 1960s colour set. The commercial arrives as a linear
// HDR render; this tone maps it and then puts it through everything a
// primitive analog set did to a broadcast:
// - overscan and a bulging, round-cornered tube (barrel distortion)
// - soft luma, and colour (chroma) smeared sideways and misregistered
// - hue that drifts and saturation that runs hot, as the tint knob never sat
// - a ghost (multipath echo) a little to the right
// - snow, scanlines, the phosphor triads, a hum bar rolling up the picture
// - line jitter and tearing, and the occasional vertical roll
// Written straight to the screen (no tone mapping after), in display values.

export interface CrtUniforms {
  uPicture: { value: Texture | null };
  uCaption: { value: Texture | null };
  uCaptionAlpha: { value: number };
  uTime: { value: number };
  uSnow: { value: number }; // extra snow, 0-1 (bursts at cuts)
  uGlitch: { value: number }; // tearing and colour upset, 0-1
  uRoll: { value: number }; // vertical roll offset, in picture heights
  uHue: { value: number }; // tint drift, radians
  uPower: { value: number }; // warm-up: 0 off, 1 on
  uLines: { value: number }; // scanlines across the picture height
  uTriads: { value: number }; // phosphor triads across the width
  uSize: { value: Vector2 }; // the tube's face in metres
  uExposure: { value: number };
}

export function crtMaterial(width: number, height: number) {
  const uniforms: CrtUniforms = {
    uPicture: { value: null },
    uCaption: { value: null },
    uCaptionAlpha: { value: 0 },
    uTime: { value: 0 },
    uSnow: { value: 0 },
    uGlitch: { value: 0 },
    uRoll: { value: 0 },
    uHue: { value: 0 },
    uPower: { value: 0 },
    uLines: { value: 240 },
    uTriads: { value: 300 },
    uSize: { value: new Vector2(width, height) },
    uExposure: { value: 0.8 },
  };
  return new ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    toneMapped: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D uPicture;
      uniform sampler2D uCaption;
      uniform float uCaptionAlpha, uTime, uSnow, uGlitch, uRoll, uHue, uPower, uLines, uTriads, uExposure;
      uniform vec2 uSize;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Narkowicz's ACES fit, then gamma: the camera's film, in effect.
      vec3 film(vec3 c) {
        c *= uExposure;
        c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
        return pow(c, vec3(1.0 / 2.2));
      }

      vec3 picture(vec2 uv) {
        if (uv.x < 0.0 || uv.x > 1.0) return vec3(0.0);
        vec3 c = film(texture2D(uPicture, uv).rgb);
        vec4 cap = texture2D(uCaption, uv);
        return mix(c, cap.rgb, cap.a * uCaptionAlpha);
      }

      vec3 toYIQ(vec3 c) {
        return vec3(
          dot(c, vec3(0.299, 0.587, 0.114)),
          dot(c, vec3(0.596, -0.274, -0.322)),
          dot(c, vec3(0.211, -0.523, 0.312)));
      }
      vec3 fromYIQ(vec3 y) {
        return vec3(
          y.x + 0.956 * y.y + 0.621 * y.z,
          y.x - 0.272 * y.y - 0.647 * y.z,
          y.x - 1.106 * y.y + 1.703 * y.z);
      }

      float roundRect(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }

      void main() {
        // The tube's rounded face, in metres from its centre.
        vec2 p = (vUv - 0.5) * uSize;
        float edge = roundRect(p, uSize * 0.5, 0.055);
        float inside = 1.0 - smoothstep(-0.004, 0.0, edge);

        // Barrel distortion and overscan: the picture runs past the glass.
        vec2 c = vUv * 2.0 - 1.0;
        c *= 1.0 + 0.055 * dot(c, c);
        c *= 0.93;
        vec2 uv = c * 0.5 + 0.5;

        // Warm-up: the picture opens out from a bright line.
        float power = max(uPower, 0.015);
        uv.y = (uv.y - 0.5) / power + 0.5;
        float opened = step(abs(uv.y - 0.5), 0.5);

        // Vertical roll, with the black blanking bar between frames.
        uv.y = uv.y + uRoll;
        float frameY = fract(uv.y);
        float blank = smoothstep(0.0, 0.025, frameY) * smoothstep(1.0, 0.975, frameY);
        uv.y = frameY;

        // Horizontal sync: each line jitters a little, and while glitching
        // a band of lines tears sideways.
        float line = floor(uv.y * uLines);
        float tick = floor(uTime * 30.0);
        uv.x += (hash(vec2(line, tick)) - 0.5) * (0.0025 + 0.02 * uGlitch);
        float bandY = fract(hash(vec2(tick, 7.0)) + uTime * 0.3);
        float band = smoothstep(0.08, 0.0, abs(uv.y - bandY));
        uv.x += band * uGlitch * 0.06 * (hash(vec2(tick, 3.0)) - 0.3);
        uv.x += sin(uv.y * 14.0 + uTime * 3.1) * 0.0012; // AC hum weave

        // Luma: soft, as the tube and the signal were.
        float px = 1.0 / 480.0;
        float Y = 0.25 * toYIQ(picture(uv - vec2(px, 0.0))).x
                + 0.5 * toYIQ(picture(uv)).x
                + 0.25 * toYIQ(picture(uv + vec2(px, 0.0))).x;
        // Ghost: a faint echo of the picture a little to the right.
        Y += 0.2 * toYIQ(picture(uv - vec2(0.024, 0.0))).x;
        Y += 0.07 * toYIQ(picture(uv - vec2(0.05, 0.0))).x;

        // Chroma: a fraction of the luma's bandwidth, so it smears sideways,
        // and it sits a little right of the luma (misconvergence).
        vec2 iq = vec2(0.0);
        for (int i = -4; i <= 4; i++) {
          iq += toYIQ(picture(uv + vec2(float(i) * 0.007 + 0.011, 0.0))).yz;
        }
        iq /= 9.0;
        float hue = uHue + uGlitch * 0.6 * sin(uTime * 23.0);
        iq = mat2(cos(hue), sin(hue), -sin(hue), cos(hue)) * iq;
        iq *= 1.5;
        // Convergence that never quite lined up: a green-magenta cast that
        // wanders down the picture, and a warm-cool swing across it.
        iq += vec2(0.035 * sin(vUv.x * 4.0 + uTime * 0.4), 0.05 * sin(vUv.y * 5.0 - uTime * 0.6));

        vec3 col = fromYIQ(vec3(Y * 0.96, iq));

        // Snow: the set's own noise, more when the signal stumbles.
        float n = hash(floor(vUv * vec2(330.0, 250.0)) + fract(uTime * 7.31) * 913.0);
        float snow = 0.2 + uSnow * 0.8 + uGlitch * 0.25;
        col = mix(col, vec3(n), snow * 0.55);
        col += (n - 0.5) * 0.12;
        // Streaks of interference: the odd bright line flicking across.
        float streak = step(0.985, hash(vec2(floor(vUv.y * uLines), tick)));
        col += streak * 0.25 * hash(vec2(floor(vUv.x * 40.0), tick));

        // The hum bar drifting up the picture.
        col *= 1.0 - 0.09 * smoothstep(0.2, 1.0, sin(6.2832 * (vUv.y - uTime * 0.11)));

        // Scanlines and the phosphor dot triads.
        float scan = abs(sin(vUv.y * uLines * 3.14159));
        col *= mix(1.0, 0.6 + 0.4 * scan, 0.55);
        float t = fract(vUv.x * uTriads);
        vec3 mask = t < 0.333 ? vec3(1.18, 0.86, 0.86) : t < 0.667 ? vec3(0.86, 1.18, 0.86) : vec3(0.86, 0.86, 1.18);
        col *= mix(vec3(1.0), mask, 0.45);

        // Flicker, and brightness lost toward the tube's edges.
        col *= 0.95 + 0.05 * hash(vec2(tick, 11.0));
        col *= 1.18 * (0.55 + 0.45 * smoothstep(0.0, -0.09, edge));
        col *= blank * opened;
        // While warming up, the narrow picture is brighter.
        col *= mix(2.2, 1.0, smoothstep(0.0, 0.6, uPower)) * smoothstep(0.0, 0.15, uPower);

        // The glass: the phosphor's grey-green when dark, and a soft reflection.
        col = max(col, vec3(0.032, 0.038, 0.035));
        vec2 h = p - vec2(-0.12, 0.12);
        col += 0.05 * exp(-dot(h, h) / 0.012);

        gl_FragColor = vec4(col * inside, 1.0);
      }
    `,
  });
}
