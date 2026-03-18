const express = require("express");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();

app.use(express.json());

const API_KEY = process.env.API_KEY;

app.post("/generate", async (req, res) => {
  const { prompt } = req.body;

  try {
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        version: "stability-ai/sdxl",
        input: { prompt }
      })
    });

    const data = await response.json();
    res.json(data);

  } catch (error) {
    res.status(500).json({ error: "Lỗi server" });
  }
});

app.get("/result/:id", async (req, res) => {
  const id = req.params.id;

  const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      "Authorization": `Token ${API_KEY}`
    }
  });

  const data = await response.json();
  res.json(data);
});

app.listen(3000, () => console.log("Server running"));