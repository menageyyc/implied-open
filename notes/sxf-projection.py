# SXF accuracy projection for /explain (2026-11-04). Inputs, saved by hand to the working folder: summ.json = GET of the
# implied-open-accuracy summary; f5_XIU.TO.json = Yahoo XIU.TO 60d/5m; x1_*.json = XIU.TO 1m in 7-day chunks (last ~29 days);
# d_XIU.TO.json = XIU.TO 6mo/1d. Run: python3 -I sxf-projection.py. Result 2026-11-04: 46 days, 0.157% / 85% (stand-in 0.284% / 83% on the same days).
import json, datetime, statistics as st, glob
from zoneinfo import ZoneInfo
NY=ZoneInfo("America/New_York")
j=json.load(open('summ.json'))
D={}
for x in j['daily']: D.setdefault(x['key'],{})[x['target_date']]=x
def bars(files):
    out={}
    for f in files:
        r=json.load(open(f))['chart']['result']
        if not r: continue
        r=r[0]; q=r['indicators']['quote'][0]
        for i,t in enumerate(r.get('timestamp') or []):
            if q['close'][i] is None: continue
            dt=datetime.datetime.fromtimestamp(t,NY); out.setdefault(dt.date().isoformat(),{})[dt.strftime('%H:%M')]=q['close'][i]
    return out
def daily(f):
    r=json.load(open(f))['chart']['result'][0]; q=r['indicators']['quote'][0]
    return {datetime.datetime.fromtimestamp(t,NY).date().isoformat():c for t,c in zip(r['timestamp'],q['close']) if c is not None}
x5=bars(['f5_XIU.TO.json']); x1=bars(glob.glob('x1_*.json')); xd=daily('d_XIU.TO.json'); xdates=sorted(xd)
EXCLUDE={'2026-08-26':'XIU ex-dividend (its price drop is the dividend, not the market)'}
def stats(rows):
    return len(rows), round(st.mean(abs(a-b) for a,b in rows),3), round(100*sum((a>0)==(b>0) for a,b in rows)/len(rows))
out={}
for scale in [1.0,1.5,2.0]:
    proj=[];stand=[];basis=[];skipped=[]
    for d,x in sorted(D['tsx'].items()):
        if not('2026-08-26'<=d<='2026-11-04'): continue
        s=D['spx'].get(d)
        if d in EXCLUDE: skipped.append(d); continue
        if '10' not in x['est'] or not s or '10' not in s['est']: skipped.append(d); continue
        # same yardstick as the table: 9:31 level where it exists, else 9:35; XIU at the same moment
        if x['m']:
            act_px=x['m']; xiu=x1.get(d,{}).get('09:30'); s_act=s['m'] or s['p']
        else:
            act_px=x['p']; xiu=x5.get(d,{}).get('09:30'); s_act=s['p']
        if not act_px or not xiu or not s_act: skipped.append(d); continue
        xprev=xd[[k for k in xdates if k<d][-1]]
        pc=x['prev_close']; act=(act_px/pc-1)*100
        x60=(xiu/xprev-1)*100
        eps=(s['est']['10']/s_act-1)*100*scale
        proj.append((x60+eps,act)); stand.append(((x['est']['10']/pc-1)*100,act)); basis.append(abs(x60-act))
    print(f"eps x{scale}: days {len(proj)} projection {stats(proj)}  stand-in {stats(stand)}  basis-only {round(st.mean(basis),3)}  skipped {skipped}")
