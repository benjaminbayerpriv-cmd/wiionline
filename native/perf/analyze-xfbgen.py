import json,re,sys
# Aufruf: python3 analyze-xfbgen.py datei.json [ab_wall_sekunde]
d=json.load(open(sys.argv[1])); t0=float(sys.argv[2]) if len(sys.argv)>2 else 55
if 'error' in d: print('FEHLER',d['error'][:200]); sys.exit(1)
def f(vs,k):
    m=re.search(' '+k+r':([0-9/]+)',vs); return [int(x) for x in m.group(1).split('/')] if m else None
rows=[(x['wall'],x['frameGen'],x['ticks'],x['tps'],f(x['vs'],'xfbgen'),f(x['vs'],'rast')) for x in d['samples'] if x.get('vs')]
a=[r for r in rows if r[0]>=t0][0]; b=rows[-1]; dw=b[0]-a[0]
c=d['cfg']
print('%s fastsw=%s tevhot=%s pscale=%s | Spielzeit %.2f | VI/s %.1f | EFB->XFB-Kopien/s %.2f (Kopie %.1f ms) | Dreiecke/s %.0f' % (c.get('label'),c.get('fastsw',0),c.get('tevhot',0),c.get('pscale','-'),((b[2]-a[2])/b[3])/dw,(b[1]-a[1])/dw,(b[4][0]-a[4][0])/dw,(b[4][2]-a[4][2])/max(1,b[4][0]-a[4][0])/1000,(b[5][0]-a[5][0])/dw))
