import express from "express";
import formidable from "formidable";
import fs from "fs";
import exifr from "exifr";
const { parse } = exifr;
import { createClient } from "@sanity/client";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// ✅ Allowed origins (no trailing slashes)
const allowedOrigins = [
  "https://mgphoto-new.vercel.app",
  "http://localhost:3000",
  "https://photos.manchestergents.com",
];

// ✅ CORS for Vercel + localhost
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("❌ Blocked CORS origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["POST", "OPTIONS"],
  })
);

// ✅ Preflight handler
app.options("/upload", cors());

// 🔑 Sanity client
const client = createClient({
  projectId: process.env.SANITY_PROJECT_ID,
  dataset: process.env.SANITY_DATASET,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: "2023-08-03",
  useCdn: false,
});

// 📤 Upload endpoint
app.post("/upload", (req, res) => {
  const form = formidable({ multiples: false, keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Upload error" });
    }

    console.log("🧾 Form fields:", fields);
    console.log("📁 Form files:", files);

    const file = Array.isArray(files?.file) ? files.file[0] : files?.file;
    const eventSlug = Array.isArray(fields.eventSlug)
      ? fields.eventSlug[0]
      : fields.eventSlug;

    if (!file || !file.filepath) {
      console.error("🚫 No valid file received");
      return res.status(400).json({ error: "No file received" });
    }

    if (!eventSlug) {
      return res.status(400).json({ error: "Missing eventSlug" });
    }

    try {
      const buffer = fs.readFileSync(file.filepath);
      const exif = await parse(buffer);
      const takenAt = exif?.DateTimeOriginal || new Date().toISOString();

      // 🔍 Find event by slug
      const eventRef = await client.fetch(
        '*[_type == "event" && slug.current == $slug][0]{ _id }',
        { slug: eventSlug }
      );

      if (!eventRef?._id) {
        return res
          .status(404)
          .json({ error: "Event not found for given slug" });
      }

      // 🖼 Upload image to Sanity
      const asset = await client.assets.upload("image", buffer, {
        filename: file.originalFilename,
      });

      // 📝 Create photo document
      const doc = await client.create({
        _type: "photo",
        name: file.originalFilename,
        image: { asset: { _ref: asset._id, _type: "reference" } },
        takenAt,
        createdAt: new Date().toISOString(),
        event: {
          _type: "reference",
          _ref: eventRef._id,
        },
      });

      console.log("✅ Upload successful:", doc._id);
      res.status(200).json({ success: true, docId: doc._id });
    } catch (err) {
      console.error("Upload failed:", err);
      res.status(500).json({ error: "Sanity upload failed" });
    }
  });
});

app.listen(3000, () => console.log("🚀 Upload server running on port 3000"));