"""Front-face photo metrology (photo 30, repo web/public/photos/30.jpeg).

Hole picks are image pixels; the camera is solved from left/right symmetry, the
3/8" chain pitch, the 5.147" cam-to-crank distance and the 9.800" deck planes.
Results feed refs/front_face.json (see PARTS.md, Front face)."""
import numpy as np, cv2, json
from scipy.optimize import least_squares
L={'A':(520,475),'B':(514,362),'C':(721,374),'D':(539,590),'E':(615,672),'F':(492,872),'G':(689,981),'H':(509,1055),'I':(734,1067)}
R={'A':(1355.5,423),'B':(1359,322),'C':(1190,349),'D':(1359,522),'E':(1305,606),'F':(1381,756),'G':(1277.5,900),'H':(1402.5,922.5),'I':(1242.5,991.5)}
cam=(977.5,647.5); crank=(1000,1060)
chains=[((759,511),(725,680),5),((1236,627.5),(1185,872.5),8)]
keys=list(L); W,Hh=1913,1440; YS=1.2
def P(params,pts):  # pts world (X,Y,Z), X>0 = image left
    f=params[0]; rv=params[1:4]; t=params[4:7]
    K=np.array([[f,0,W/2],[0,f,Hh/2],[0,0,1]])
    q=np.array([(-x,-z,-y) for x,y,z in pts],float)
    p,_=cv2.projectPoints(q,rv,t,K,None); return p.reshape(-1,2)
def res(v,wcr):
    cp=v[:7]; XZ=v[7:25].reshape(-1,2); ch=v[25:33].reshape(-1,2)
    pts=[];obs=[]
    for k,(X,Z) in zip(keys,XZ): pts+=[(X,0,Z),(-X,0,Z)]; obs+=[L[k],R[k]]
    pts+=[(0,YS,5.147)]; obs+=[cam]
    for i,(a,b,n) in enumerate(chains):
        pts+=[(ch[2*i][0],YS,ch[2*i][1]),(ch[2*i+1][0],YS,ch[2*i+1][1])]; obs+=[a,b]
    r=list((P(cp,pts)-np.array(obs)).ravel())
    r+=list(wcr*(P(cp,[(0,YS,0)])-np.array([crank])).ravel())
    for i,(a,b,n) in enumerate(chains): r.append(40*(np.linalg.norm(ch[2*i]-ch[2*i+1])-n*0.375))
    return np.array(r)
x0=[1440,0,0,0,0,-5,40]+sum([[ (960-L[k][0])/80,(1060-L[k][1])/80] for k in keys],[])+[3,7,3,5,-3,5,-3,2]
for wcr in (0.0,0.3,1.0):
  for f0 in (1100,1440,2000):
    x=list(x0); x[0]=f0
    s=least_squares(res,x,args=(wcr,))
    v=s.x; XZ=v[7:25].reshape(-1,2)
    rp=res(v,0)[:-2]
    crk=P(v[:7],[(0,YS,0)])[0]
    print(f'wcr {wcr} f0 {f0}: f={v[0]:.0f} dist={np.linalg.norm(v[4:7]):.1f} rms={np.sqrt(np.mean(rp**2)):.1f} crank_px=({crk[0]:.0f},{crk[1]:.0f}) ', ' '.join(f'{k}:{abs(a):.2f},{b:.2f}' for k,(a,b) in zip(keys,XZ)))
    if wcr==0.3 and f0==1440: json.dump({k:[abs(a),b] for k,(a,b) in zip(keys,XZ)}|{'f':v[0]},open('front_pts.json','w'),indent=1); best=v
degL=[(650,150)+(0,),(500,282),(355,410),(210,535),(80,650)]
degR=[(1215,130),(1300,232),(1380,330),(1460,428),(1535,522)]
def resD(v,wcr,wdeck):
    n=33; base=res(v[:n],wcr)
    cp=v[:7]; tL=v[n:n+5]; tR=v[n+5:n+10]
    pts=[];obs=[]
    for t,o in zip(tL,degL): pts.append((t,0,13.859-t)); obs.append(o[:2])
    for t,o in zip(tR,degR): pts.append((-t,0,13.859-t)); obs.append(o)
    r=(P(cp,pts)-np.array(obs)).ravel()*wdeck
    return np.r_[base,r]
x0=[1440,0,0,0,0,-5,30]+sum([[ (960-L[k][0])/80,(1060-L[k][1])/80] for k in keys],[])+[3,7,3,5,-3,5,-3,2]+[5,6,7,8,9]*2
for wcr in (0.0,1.0):
  for wd in (0.5,1.0):
    best=None
    for f0 in (800,1440,2200):
        x=list(x0); x[0]=f0; x[6]=30 if f0>1000 else 15
        s=least_squares(resD,x,args=(wcr,wd))
        if best is None or s.cost<best.cost: best=s
    v=best.x; XZ=v[7:25].reshape(-1,2); r=resD(v,0,1)
    crk=P(v[:7],[(0,YS,0)])[0]
    print(f'wcr {wcr} wd {wd}: f={v[0]:.0f} D={np.linalg.norm(v[4:7]):.1f} rms={np.sqrt(np.mean(r[:-2]**2)):.1f} crank_px=({crk[0]:.0f},{crk[1]:.0f}) deckT L {v[33:38].round(2)}')
    print('   ',' '.join(f'{k}:{abs(a):.2f},{b:.2f}' for k,(a,b) in zip(keys,XZ)))
    if wcr==1.0 and wd==1.0: json.dump({'pts':{k:[float(abs(a)),float(b)] for k,(a,b) in zip(keys,XZ)},'cam':[float(t) for t in v[:7]]},open('front_fit3.json','w'),indent=1)
