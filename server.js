import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

app.use(express.json());
app.use(cors());

// 🔑 API KEY từ Railway Variables
const API_KEY = process.env.API_KEY;

// 👉 API tạo ảnh
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "stability-ai/sdxl",
        input: {
          prompt: prompt
        }
      })
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi server" });
  }
});

// 👉 API check kết quả
app.get("/result/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        "Authorization": `Token ${API_KEY}`
      }
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Lỗi check result" });
  }
});

// 🔥 FIX QUAN TRỌNG CHO RAILWAY
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
