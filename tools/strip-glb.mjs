/**
 * Strip a .glb down to the animation clips a game actually plays.
 *
 * The Quaternius character pack ships 24 clips — Death, Gun_Shoot, Sword_Slash,
 * Punch, Kick, Roll, Run_Back/Left/Right — and Horse Meadow plays three of them.
 * That dead weight is about a third of every file, and every byte gets precached
 * onto an iPad so the game works with the wifi off.
 *
 * A GLB is a header, a JSON chunk and a binary chunk. Dropping an animation from
 * the JSON alone saves nothing — its keyframe data still sits in the binary. So
 * this drops the clips, garbage-collects the accessors and bufferViews nothing
 * references any more, repacks the binary chunk with only what survived, and
 * remaps every index that moved.
 *
 * The three girls in public/ were made with it, and this is the only record of
 * how — a committed binary nobody can regenerate is a trap. To redo one:
 *
 *   curl -sL https://static.poly.pizza/<id>.glb -o raw.glb
 *   node tools/strip-glb.mjs raw.glb public/girl-dress.glb Idle Walk Run
 *
 * The poly.pizza ids are recorded in each public/*.LICENSE.txt.
 *
 *   node tools/strip-glb.mjs <in.glb> <out.glb> Idle Walk Run
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inPath, outPath, ...keepClips] = process.argv
const KEEP = new Set(keepClips)

// ---- read
const buf = readFileSync(inPath)
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a glb')
let json = null
let bin = null
for (let off = 12; off < buf.length; ) {
  const len = buf.readUInt32LE(off)
  const type = buf.readUInt32LE(off + 4)
  const body = buf.subarray(off + 8, off + 8 + len)
  if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'))
  else if (type === 0x004e4942) bin = body
  off += 8 + len + ((4 - (len % 4)) % 4)
}
const g = json

// ---- drop the clips we never play
const before = g.animations?.length || 0
g.animations = (g.animations || []).filter((a) => KEEP.has(a.name.split('|').pop()))

// ---- mark every accessor still referenced by something
const liveAcc = new Set()
const mark = (i) => { if (i !== undefined && i !== null) liveAcc.add(i) }
for (const m of g.meshes || []) {
  for (const p of m.primitives || []) {
    Object.values(p.attributes || {}).forEach(mark)
    mark(p.indices)
    for (const t of p.targets || []) Object.values(t).forEach(mark)
  }
}
for (const s of g.skins || []) mark(s.inverseBindMatrices)
for (const a of g.animations) for (const s of a.samplers) { mark(s.input); mark(s.output) }

// ---- repack: copy only the bufferViews the surviving accessors point at
const accMap = new Map()
const bvMap = new Map()
const chunks = []
let cursor = 0
const newAccessors = []
const newBufferViews = []

for (const oldAcc of [...liveAcc].sort((a, b) => a - b)) {
  const acc = { ...g.accessors[oldAcc] }
  if (acc.bufferView !== undefined) {
    if (!bvMap.has(acc.bufferView)) {
      const bv = g.bufferViews[acc.bufferView]
      const start = bv.byteOffset || 0
      const bytes = bin.subarray(start, start + bv.byteLength)
      const pad = (4 - (cursor % 4)) % 4
      if (pad) { chunks.push(Buffer.alloc(pad)); cursor += pad }
      const copy = { buffer: 0, byteOffset: cursor, byteLength: bv.byteLength }
      if (bv.byteStride !== undefined) copy.byteStride = bv.byteStride
      if (bv.target !== undefined) copy.target = bv.target
      bvMap.set(acc.bufferView, newBufferViews.length)
      newBufferViews.push(copy)
      chunks.push(bytes)
      cursor += bv.byteLength
    }
    acc.bufferView = bvMap.get(acc.bufferView)
  }
  accMap.set(oldAcc, newAccessors.length)
  newAccessors.push(acc)
}

// ---- remap every index that moved
const remap = (i) => (i === undefined || i === null ? i : accMap.get(i))
for (const m of g.meshes || []) {
  for (const p of m.primitives || []) {
    for (const k of Object.keys(p.attributes || {})) p.attributes[k] = remap(p.attributes[k])
    if (p.indices !== undefined) p.indices = remap(p.indices)
    for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = remap(t[k])
  }
}
for (const s of g.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = remap(s.inverseBindMatrices)
for (const a of g.animations) for (const s of a.samplers) { s.input = remap(s.input); s.output = remap(s.output) }

g.accessors = newAccessors
g.bufferViews = newBufferViews
const newBin = Buffer.concat(chunks)
g.buffers = [{ byteLength: newBin.length }]

// ---- write
const jsonBuf = Buffer.from(JSON.stringify(g), 'utf8')
const jsonPad = (4 - (jsonBuf.length % 4)) % 4
const binPad = (4 - (newBin.length % 4)) % 4
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)])
const binChunk = Buffer.concat([newBin, Buffer.alloc(binPad)])

const out = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binChunk.length)
out.write('glTF', 0)
out.writeUInt32LE(2, 4)
out.writeUInt32LE(out.length, 8)
out.writeUInt32LE(jsonChunk.length, 12)
out.writeUInt32LE(0x4e4f534a, 16)
jsonChunk.copy(out, 20)
out.writeUInt32LE(binChunk.length, 20 + jsonChunk.length)
out.writeUInt32LE(0x004e4942, 24 + jsonChunk.length)
binChunk.copy(out, 28 + jsonChunk.length)
writeFileSync(outPath, out)

console.log(
  `${inPath} -> ${outPath}  ${(buf.length / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB  ` +
    `(${(100 - (out.length / buf.length) * 100).toFixed(0)}% smaller)  clips ${before} -> ${g.animations.length}`
)
