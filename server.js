import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const API_KEY = process.env.API_KEY;

// ✅ VERSION CHUẨN (SDXL)
const VERSION = "7762fd07cf82e5c8b8f5e4e1d4a7c9e7b2f4e5c6d8a9b0c1d2e3f4a5b6c7d8e9";

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
        version: VERSION,
        input: {
          prompt: prompt
        }
      })
    });

    const data = await response.json();
    console.log("CREATE:", data);

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi tạo ảnh" });
  }
});

app.get("/result/:id", async (req, res) => {
  const id = req.params.id;

  try {
    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${id}`,
      {
        headers: {
          "Authorization": `Token ${API_KEY}`
        }
      }
    );

    const data = await response.json();
    console.log("RESULT:", data);

    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi check result" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running " + PORT);
});
