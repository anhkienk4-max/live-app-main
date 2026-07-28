import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const outputDirectory = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = path.resolve(outputDirectory, '..', '..', 'tiktok-dashboard.jpg')
const source = await readFile(sourcePath)

await mkdir(outputDirectory, { recursive: true })
await copyFile(sourcePath, path.join(outputDirectory, 'tiktok-reference.jpg'))

const scaled = await sharp(source)
  .resize({ width: 1311 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toBuffer()
await sharp({
  create: {
    width: 2200,
    height: 1200,
    channels: 3,
    background: '#15171b',
  },
})
  .composite([{ input: scaled, left: 470, top: 150 }])
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outputDirectory, 'tiktok-scale-shift.jpg'))

await sharp(source)
  .extract({ left: 350, top: 65, width: 1100, height: 570 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outputDirectory, 'tiktok-partial-crop.jpg'))

const sidebarVariant = await sharp(source)
  .resize({ width: 1573 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toBuffer()
await sharp({
  create: {
    width: 2100,
    height: 1050,
    channels: 3,
    background: '#202328',
  },
})
  .composite([{ input: sidebarVariant, left: 310, top: 55 }])
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outputDirectory, 'tiktok-sidebar-shift.jpg'))

const primary = await sharp(source)
  .resize({ width: 1486 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toBuffer()
const duplicate = await sharp(source)
  .resize({ width: 786 })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toBuffer()
await sharp({
  create: {
    width: 2500,
    height: 1400,
    channels: 3,
    background: '#f3f4f6',
  },
})
  .composite([
    { input: primary, left: 80, top: 80 },
    { input: duplicate, left: 1650, top: 850 },
  ])
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outputDirectory, 'tiktok-composite.jpg'))

await sharp(source)
  .extend({
    top: 90,
    bottom: 90,
    left: 130,
    right: 130,
    background: '#d8d9dc',
  })
  .affine([
    [1, 0.06],
    [-0.025, 1],
  ], {
    background: '#d8d9dc',
    interpolate: sharp.interpolators.bicubic,
  })
  .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
  .toFile(path.join(outputDirectory, 'tiktok-affine-camera.jpg'))
