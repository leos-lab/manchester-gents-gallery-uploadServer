import express from 'express'
import formidable from 'formidable'
import fs from 'fs'
import { parse } from 'exifr'
import { createClient } from '@sanity/client'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
app.use(cors())

const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2023-08-03',
  useCdn: false,
})

app.post('/upload', (req, res) => {
  const form = formidable({ multiples: false, keepExtensions: true })

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Formidable error:', err)
      return res.status(500).json({ error: 'Upload error' })
    }

    const file = files.file
    if (!file) return res.status(400).json({ error: 'No file uploaded' })

    try {
      const buffer = fs.readFileSync(file.filepath)
      const exif = await parse(buffer)
      const takenAt = exif?.DateTimeOriginal || new Date().toISOString()

      const asset = await client.assets.upload('image', buffer, {
        filename: file.originalFilename,
      })

      const doc = await client.create({
        _type: 'photo',
        image: { asset: { _ref: asset._id, _type: 'reference' } },
        takenAt,
        createdAt: new Date().toISOString(),
        eventSlug: fields.eventSlug || 'unknown',
      })

      res.status(200).json({ success: true, docId: doc._id })
    } catch (err) {
      console.error('Upload failed:', err)
      res.status(500).json({ error: 'Sanity upload failed' })
    }
  })
})

app.listen(3000, () => console.log('Upload server running on port 3000'))