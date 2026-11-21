"""Measure the Cometic C5333 head gasket image into deck coordinates.

u: inches along the deck from the cylinder-1 bore centre towards the rear.
v: inches across the deck, + towards the lifter valley.
The product image is the LEFT-bank deck seen square-on from outside (front
at image left, valley at image top); confirmed against Drew's photo 38.
Scale from the four bore centres (4.840" spacing).
"""
import cv2, numpy as np, json
im = cv2.imread('g.jpg'); g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
mask = (g < 128).astype(np.uint8)
n, lab, st, cen = cv2.connectedComponentsWithStats(mask, 8)
gas = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
cnts, hier = cv2.findContours(gas, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
outer = max(cnts, key=cv2.contourArea)
filled = np.zeros_like(gas); cv2.drawContours(filled, [outer], -1, 1, -1)
holes = ((filled == 1) & (gas == 0)).astype(np.uint8)
# gold rivets read as holes: add them back to the gasket
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
gold = ((hsv[...,0] > 10) & (hsv[...,0] < 40) & (hsv[...,1] > 80) & (hsv[...,2] > 100)).astype(np.uint8)
gold = cv2.dilate(gold, np.ones((7,7), np.uint8))
holes[gold > 0] = 0
holes = cv2.morphologyEx(holes, cv2.MORPH_OPEN, np.ones((5,5), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(holes, 8)
comps = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 300]
bores = sorted([i for i in comps if st[i, cv2.CC_STAT_AREA] > 100000], key=lambda i: cen[i][0])
bc = np.array([cen[i] for i in bores]); p = np.polyfit(bc[:,0], bc[:,1], 1); ang = np.arctan(p[0])
s = (np.diff(bc[:,0]) / np.cos(ang)).mean() / 4.840
o = bc[0]; c, sn = np.cos(-ang), np.sin(-ang)
def uv(pts):
    pts = np.asarray(pts, float) - o
    x = c*pts[:,0] - sn*pts[:,1]; y = sn*pts[:,0] + c*pts[:,1]
    return np.stack([x/s, -y/s], 1)
def poly(cnt, eps_in=0.008):
    ap = cv2.approxPolyDP(cnt, eps_in*s, True)[:,0,:]
    return uv(ap).round(4).tolist()
out = dict(source="Cometic C5333 (Gen V/VI BBC MLS head gasket) product image H1177MLS.jpg, 2500 px",
           scale_px_per_in=round(float(s),3), tilt_deg=round(float(np.degrees(ang)),4),
           outline=poly(outer, 0.01), holes=[])
for i in comps:
    m = (lab == i).astype(np.uint8)
    cc,_ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); cc = cc[0]
    a = st[i, cv2.CC_STAT_AREA]; per = cv2.arcLength(cc, True); circ = 4*np.pi*a/per**2
    (cu, cv_), = uv([cen[i]]); d = 2*np.sqrt(a/np.pi)/s
    out['holes'].append(dict(u=round(float(cu),4), v=round(float(cv_),4), d_eq=round(float(d),4),
                             circularity=round(float(circ),3), contour=poly(cc)))
out['holes'].sort(key=lambda h: (h['u'], h['v']))
json.dump(out, open('deck_c5333.json','w'), indent=1)
print(len(out['holes']), 'holes; scale', out['scale_px_per_in'])
for h in out['holes']: print(f"u={h['u']:7.3f} v={h['v']:7.3f} d={h['d_eq']:.3f} circ={h['circularity']:.2f} pts={len(h['contour'])}")
