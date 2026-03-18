import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

const API_KEY = process.env.API_KEY;

// ✅ DÙNG MODEL NAME (KHÔNG dùng version)
const MODEL = "stability-ai/sdxl";

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
        model: MODEL,
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
    const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: {
        "Authorization": `Token ${API_KEY}`
      }
    });

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
