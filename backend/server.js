const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const wss = new WebSocketServer({ server });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", async (message) => {
    const prompt = message.toString();
    console.log(`Received message: ${prompt}`);

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-pro" });
      const result = await model.generateContentStream(prompt);

      // Stream raw chunks to the frontend
      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        ws.send(chunkText); // Send raw chunk
      }

      // Signal completion
      ws.send("END");
    } catch (error) {
      console.error("Error:", error);
      ws.send("ERROR");
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});