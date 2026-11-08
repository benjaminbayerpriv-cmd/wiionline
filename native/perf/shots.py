import sys,json,base64,zlib,struct
d=json.load(sys.stdin); out=sys.argv[1]
def png(w,h,rgba):
    raw=b"".join(b"\x00"+rgba[y*w*4:(y+1)*w*4] for y in range(h))
    def ch(t,b): return struct.pack(">I",len(b))+t+b+struct.pack(">I",zlib.crc32(t+b)&0xffffffff)
    return b"\x89PNG\r\n\x1a\n"+ch(b"IHDR",struct.pack(">IIBBBBB",w,h,8,6,0,0,0))+ch(b"IDAT",zlib.compress(raw))+ch(b"IEND",b"")
for s in d.get("shots",[]):
    open("%s-%s.png"%(out,s["label"]),"wb").write(png(s["w"],s["h"],base64.b64decode(s["b64"]))); print("%s-%s.png %dx%d"%(out,s["label"],s["w"],s["h"]))
