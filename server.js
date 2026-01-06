require("dotenv").config(); // Load env variables
const express = require("express");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
// Enable CORS for all routes (only for local development!)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});
const upload = multer({ storage: multer.memoryStorage() }); // Store file in memory for upload

const s3_aws = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Configure S3 client for MinIO (this is the key change!)
const s3_minio = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT, // MinIO API endpoint
  region: "us-east-1", // MinIO doesn't care about region, but SDK needs one
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // REQUIRED for MinIO (path-style URLs)
});

// Endpoint: POST /upload - Upload file to S3 and return presigned URL
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const key = `uploads/${Date.now()}_${req.file.originalname}`; // Unique key (folder + timestamp + name)

  try {
    // Upload to S3
    await s3_aws.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    // Upload to MinIO
    await s3_minio.send(
      new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    // Generate presigned URL for download/access (expires in 1 hour)
    const signedUrl = await getSignedUrl(
      s3_aws,
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
      }),
      { expiresIn: 3600 }
    );

    // Generate presigned URL (expires in 1 hour)
    const signedUrl2 = await getSignedUrl(
      s3_minio,
      new GetObjectCommand({
        Bucket: process.env.MINIO_BUCKET,
        Key: key,
      }),
      { expiresIn: 3600 }
    );

    res.json({ message: "File uploaded successfully", url: signedUrl });
    res.json({
      message: "File uploaded successfully to MinIO",
      url: signedUrl2,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Start server
const PORT = 3000;
// Serve the frontend
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
