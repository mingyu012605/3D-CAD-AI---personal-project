// Generates simple architectural GLB sample files without any dependencies.
// Run: node create-building-samples.mjs
import { writeFileSync } from 'fs';

function pad4(n) { return Math.ceil(n / 4) * 4; }

function boxGeo(cx, cy, cz, w, h, d) {
    const [hw, hh, hd] = [w / 2, h / 2, d / 2];
    const pos = new Float32Array([
        // top +Y
        cx-hw,cy+hh,cz-hd, cx+hw,cy+hh,cz-hd, cx+hw,cy+hh,cz+hd, cx-hw,cy+hh,cz+hd,
        // bottom -Y
        cx-hw,cy-hh,cz+hd, cx+hw,cy-hh,cz+hd, cx+hw,cy-hh,cz-hd, cx-hw,cy-hh,cz-hd,
        // front +Z
        cx-hw,cy-hh,cz+hd, cx+hw,cy-hh,cz+hd, cx+hw,cy+hh,cz+hd, cx-hw,cy+hh,cz+hd,
        // back -Z
        cx+hw,cy-hh,cz-hd, cx-hw,cy-hh,cz-hd, cx-hw,cy+hh,cz-hd, cx+hw,cy+hh,cz-hd,
        // right +X
        cx+hw,cy-hh,cz+hd, cx+hw,cy-hh,cz-hd, cx+hw,cy+hh,cz-hd, cx+hw,cy+hh,cz+hd,
        // left -X
        cx-hw,cy-hh,cz-hd, cx-hw,cy-hh,cz+hd, cx-hw,cy+hh,cz+hd, cx-hw,cy+hh,cz-hd,
    ]);
    const nrm = new Float32Array([
         0,1,0, 0,1,0, 0,1,0, 0,1,0,
         0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
         0,0,1, 0,0,1, 0,0,1, 0,0,1,
         0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
         1,0,0, 1,0,0, 1,0,0, 1,0,0,
        -1,0,0,-1,0,0,-1,0,0,-1,0,0,
    ]);
    const idx = new Uint16Array([
        0,1,2, 0,2,3, 4,5,6, 4,6,7,
        8,9,10, 8,10,11, 12,13,14, 12,14,15,
        16,17,18, 16,18,19, 20,21,22, 20,22,23,
    ]);
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (let i = 0; i < pos.length; i += 3) {
        minX=Math.min(minX,pos[i]); maxX=Math.max(maxX,pos[i]);
        minY=Math.min(minY,pos[i+1]); maxY=Math.max(maxY,pos[i+1]);
        minZ=Math.min(minZ,pos[i+2]); maxZ=Math.max(maxZ,pos[i+2]);
    }
    return { pos, nrm, idx, min:[minX,minY,minZ], max:[maxX,maxY,maxZ] };
}

function buildGLB(parts) {
    // parts = [{ geo, color:[r,g,b] }]
    const chunks = [], bvs = [], accs = [], meshes = [], nodes = [], mats = [];
    let byteOff = 0;

    for (let i = 0; i < parts.length; i++) {
        const { geo, color } = parts[i];
        const posB = Buffer.from(geo.pos.buffer);
        const nrmB = Buffer.from(geo.nrm.buffer);
        const idxB = Buffer.from(geo.idx.buffer);
        const idxPad = pad4(idxB.length);
        const idxBuf = Buffer.alloc(idxPad); idxB.copy(idxBuf);

        const pv = bvs.length;
        bvs.push({ buffer:0, byteOffset:byteOff, byteLength:posB.length, target:34962 });
        byteOff += posB.length; chunks.push(posB);

        const nv = bvs.length;
        bvs.push({ buffer:0, byteOffset:byteOff, byteLength:nrmB.length, target:34962 });
        byteOff += nrmB.length; chunks.push(nrmB);

        const iv = bvs.length;
        bvs.push({ buffer:0, byteOffset:byteOff, byteLength:idxB.length, target:34963 });
        byteOff += idxPad; chunks.push(idxBuf);

        const pa = accs.length;
        accs.push({ bufferView:pv, byteOffset:0, componentType:5126, count:geo.pos.length/3, type:'VEC3', min:geo.min, max:geo.max });
        const na = accs.length;
        accs.push({ bufferView:nv, byteOffset:0, componentType:5126, count:geo.nrm.length/3, type:'VEC3' });
        const ia = accs.length;
        accs.push({ bufferView:iv, byteOffset:0, componentType:5123, count:geo.idx.length, type:'SCALAR' });

        mats.push({ pbrMetallicRoughness:{ baseColorFactor:[...color,1], metallicFactor:0.05, roughnessFactor:0.75 } });
        meshes.push({ name:`m${i}`, primitives:[{ attributes:{ POSITION:pa, NORMAL:na }, indices:ia, material:i, mode:4 }] });
        nodes.push({ mesh:i, name:`n${i}` });
    }

    const bin = Buffer.concat(chunks);
    const gltf = {
        asset:{ version:'2.0', generator:'Forma Link Sample Builder' },
        scene:0,
        scenes:[{ nodes:nodes.map((_,i)=>i) }],
        nodes, meshes, accessors:accs, bufferViews:bvs,
        buffers:[{ byteLength:byteOff }], materials:mats
    };

    const jsonB = Buffer.from(JSON.stringify(gltf), 'utf8');
    const jp = pad4(jsonB.length);
    const bp = pad4(bin.length);
    const total = 12 + 8 + jp + 8 + bp;
    const glb = Buffer.alloc(total);
    let o = 0;
    glb.writeUInt32LE(0x46546C67, o); o+=4;
    glb.writeUInt32LE(2, o); o+=4;
    glb.writeUInt32LE(total, o); o+=4;
    glb.writeUInt32LE(jp, o); o+=4;
    glb.writeUInt32LE(0x4E4F534A, o); o+=4;
    jsonB.copy(glb, o); glb.fill(0x20, o+jsonB.length, o+jp); o+=jp;
    glb.writeUInt32LE(bp, o); o+=4;
    glb.writeUInt32LE(0x004E4942, o); o+=4;
    bin.copy(glb, o);
    return glb;
}

// ── House ─────────────────────────────────────────────────────────────────
writeFileSync('samples/house.glb', buildGLB([
    { geo: boxGeo( 0,  2.5,  0,  10,   5,  8),   color: [0.831, 0.659, 0.506] }, // walls tan
    { geo: boxGeo( 0,  6.3,  0,  11.5, 2.6, 9.5),color: [0.545, 0.212, 0.141] }, // roof dark red
    { geo: boxGeo( 0,  1.5,  4.1, 1.6, 3,  0.3), color: [0.361, 0.231, 0.118] }, // door brown
    { geo: boxGeo( 3,  3.5,  4.1, 1.8, 1.4, 0.2),color: [0.580, 0.773, 0.882] }, // window R
    { geo: boxGeo(-3,  3.5,  4.1, 1.8, 1.4, 0.2),color: [0.580, 0.773, 0.882] }, // window L
    { geo: boxGeo( 3,  8.2,  1,   1,   2,  1),   color: [0.612, 0.557, 0.510] }, // chimney
]));
console.log('✅ samples/house.glb');

// ── Office Tower ─────────────────────────────────────────────────────────
writeFileSync('samples/tower.glb', buildGLB([
    { geo: boxGeo( 0, 17,    0,   8,  34,  8),   color: [0.420, 0.588, 0.718] }, // tower steel-blue
    { geo: boxGeo( 0,  2,    0,  13,   4, 13),   color: [0.600, 0.647, 0.675] }, // lobby concrete
    { geo: boxGeo( 0, 34.5,  0,   8.4, 1, 8.4), color: [0.337, 0.400, 0.447] }, // roof slab
    { geo: boxGeo( 0, 36,    0,   3,   3,  3),   color: [0.290, 0.337, 0.369] }, // HVAC unit
    { geo: boxGeo(-1.5,38.5, 0,   0.3, 5,  0.3),color: [0.780, 0.780, 0.780] }, // antenna
]));
console.log('✅ samples/tower.glb');
