require('dotenv').config(); // optional on local dev
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // pulled from Render env var
});
const openai = new OpenAIApi(configuration);

app.post('/api/ai', async (req, res) => {
  const userPrompt = req.body.prompt;
  console.log("[User Prompt]", userPrompt);

  try {
    const completion = await openai.createChatCompletion({
      model: 'gpt-4', // or gpt-3.5-turbo
      messages: [{ role: 'user', content: userPrompt }],
    });

    const aiMessage = completion.data.choices[0].message.content;
    res.json({ content: aiMessage });
  } catch (err) {
    console.error("[OpenAI Error]", err.response?.data || err.message);
    res.status(500).json({ message: "AI request failed." });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
