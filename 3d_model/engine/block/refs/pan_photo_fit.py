"""Pan-rail photo metrology (Drew's build album photo 431, block inverted).

Camera solved from the main-cap stud nuts (caps 1-4: y from the 4.840" bore
spacing, x = +/-1.95 / +/-3.00, nut faces at z = -3.75), then the pan plane
z = 0 is rectified to a top view and the rail holes found by Hough circles.
Results feed refs/pan_rail.json."""
from scipy.optimize import least_squares
W,H=1440,1913
mains=[22.27,17.43,12.59,7.75]
nuts=[[(440,1565),(540,1560),(885,1555),(990,1562)],
      [(480,1138),(560,1122),(850,1105),(935,1120)],
      [(512,870),(575,845),(825,835),(900,862)],
      [(528,655),(590,622),(795,618),(875,635)]]
xs=[-3.00,-1.95,1.95,3.00]; zn=-3.75
P3=[];O=[]
for y,row in zip(mains,nuts):
    for x,uv in zip(xs,row): P3.append((x,y,zn)); O.append(uv)
corners=[((-6.25,24,0),(275,1718)),((6.25,24,0),(1160,1700))]
def proj(v,pts):
    f=v[0]; K=np.array([[f,0,W/2],[0,f,H/2],[0,0,1]])
    p,_=cv2.projectPoints(np.array(pts,float),v[1:4],v[4:7],K,None); return p.reshape(-1,2)
def res(v,wc=0.5):
    r=(proj(v,P3)-np.array(O)).ravel()
    r2=(proj(v,[c[0] for c in corners])-np.array([c[1] for c in corners])).ravel()*wc
    return np.r_[r,r2]
best=None
for f0 in (900,1300,1800):
  for rx in (2.0,2.5,3.0):
    x0=[f0,rx,0,0, -0,-10,30]
    s=least_squares(res,x0)
    if best is None or s.cost<best.cost: best=s
v=best.x; r=res(v,0)[:32].reshape(-1,2)
print('f',round(v[0]),'rvec',np.round(v[1:4],3),'t',np.round(v[4:7],2),'rms nuts',np.sqrt((r**2).mean()).round(1),'corner resid',(res(v)[32:]/0.5).round(1))
json.dump(v.tolist(),open('cam431.json','w'))
