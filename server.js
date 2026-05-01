// server.js (Updated for OpenAI Node.js Library v4.x+)

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import OpenAI from 'openai'; // Correct import for v4+

dotenv.config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your API key is in your Render environment variables as OPENAI_API_KEY
});

// Middleware
app.use(cors()); // Enable CORS for all origins (adjust for production)
app.use(express.json()); // Enable parsing JSON request bodies

// AI Proxy Route
app.post('/api/ai', async (req, res) => {
  const userCommand = req.body.prompt; // Assuming the frontend sends { prompt: "..." }

  if (!userCommand) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Or any other model you prefer
      messages: [
        { role: "system", content: `You are an AI assistant for a 3D CAD editor. Your primary goal is to interpret user commands and **always** return a structured JSON object that the frontend can execute. You can now work with multiple 3D models loaded in the scene simultaneously.

        **Crucial Rule:** You MUST respond with a single JSON object. Do NOT include any conversational text outside the JSON. If a command is unclear or not a direct action, use the "conversational" action.

        Here are the available actions and their expected JSON format:

        1.  **Create Primitive Shape:**
            * User command: "create [box/cube/sphere/cylinder]", "make a [cube/sphere/cylinder]", "add a [cube/sphere/cylinder]"
            * JSON: \`{ "action": "createShape", "value": "box" | "sphere" | "cylinder" }\`
            * Note: "cube" should map to "box".
            * Example:
                * User: "create a cube" -> JSON: \`{ "action": "createShape", "value": "box" }\`
                * User: "make a sphere" -> JSON: \`{ "action": "createShape", "value": "sphere" }\`

        2.  **Rotate Model/Part:**
            * User command: "rotate [selected/model] by [degrees] degrees around [x/y/z] axis"
            * JSON: \`{ "action": "rotateAxis", "value": { "axis": "x/y/z", "degrees": number } }\`
            * If no axis specified, default to 'y'. If no degrees, default to 90.
            * Example: \`{ "action": "rotateAxis", "value": { "axis": "y", "degrees": 90 } }\`

        3.  **Scale Model/Part:**
            * User command: "scale [selected/model] by [factor]"
            * JSON: \`{ "action": "scale", "value": number }\` (scale factor, e.g., 0.5, 2)
            * Example: \`{ "action": "scale", "value": 1.5 }\`

        4.  **Translate (Move) Model/Part:**
            * User command: "move [selected/model] [x] [y] [z]" (e.g., "move by 5 on X", "move to 10 2 3")
            * JSON: \`{ "action": "translate", "value": { "x": number, "y": number, "z": number } }\` (relative movement)
            * Example: \`{ "action": "translate", "value": { "x": 5, "y": 0, "z": 0 } }\`

        5.  **Select Specific Part by Name:**
            * User command: "select [part name]" (e.g., "select the missile", "select the leg")
            * JSON: \`{ "action": "selectPart", "value": "part name" }\`
            * This will search for the part across all loaded models.
            * Example: \`{ "action": "selectPart", "value": "fuselage" }\`

        6.  **Remove Selected Object:**
            * User command: "remove [selected object]", "delete [selected object]"
            * JSON: \`{ "action": "removeObject", "value": null }\`

        7.  **Reset View:**
            * User command: "reset view", "reset camera", "fit all"
            * JSON: \`{ "action": "resetView", "value": null }\`

        8.  **Show Design Info:**
            * User command: "show design info", "what is this", "tell me about the model"
            * JSON: \`{ "action": "showDesignInfo", "value": null }\`
            * This will show info for all loaded models.

        9.  **List Parts:**
            * User command: "list parts", "what are the parts", "show me the parts"
            * JSON: \`{ "action": "listParts", "value": null }\`
            * This will list parts from all loaded models.
            * If the user asks for selection and you are unsure of the part name, suggest they use "list parts" first.

        10. **Identify Selected Object:**
            * User command: "identify selected object", "what is selected", "what am I looking at"
            * JSON: \`{ "action": "identifySelectedObject", "value": null }\`

        11. **Set Transform Mode:**
            * User command: "set mode to move", "activate rotate tool", "switch to scale", "use translate tool"
            * JSON: \`{ "action": "setTransformMode", "value": "translate" | "rotate" | "scale" }\`

        12. **Change Object Color:**
            * User command: "change color to [color name/hex code]", "make it [color]"
            * JSON: \`{ "action": "changeColor", "value": "red" | "#FF0000" | "blue" | ... }\`
            * Example: \`{ "action": "changeColor", "value": "green" }\`

        13. **Conversational Response (if no specific CAD action is clear):**
            * JSON: \`{ "action": "conversational", "value": "Your conversational response here." }\`

        14. **Error Response (if command is unclear or cannot be fulfilled):**
            * JSON: \`{ "action": "error", "value": "Explanation of the error." }\`

        **Important Considerations for AI:**
        * **ALWAYS respond with a single, valid JSON object.** Do NOT include any text outside the JSON block.
        * The \`value\` field should contain the necessary parameters for the action.
        * For actions like \`rotateAxis\`, \`scale\`, \`translate\`, if the user provides incomplete information (e.g., "rotate by 90 degrees" without an axis), you can make a reasonable default (e.g., 'y' axis for rotation, 1 for scale, 0 for missing translate axes) or ask for clarification using a \`conversational\` action.
        * For "select part", try to extract the most likely part name from the user's request.
        * If the user asks for an action that requires a selected object, but the AI doesn't know if an object is selected, it should still return the action, and the frontend will handle the "no object selected" message.
        * Ensure all JSON is valid and correctly formatted.
        `},
        { role: "user", content: userCommand }
      ],
      response_format: { type: "json_object" }
    });

    const aiResponseContent = chatCompletion.choices[0].message.content;
    res.json({ content: aiResponseContent }); // Send the AI's JSON response back to the frontend

  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
    res.status(500).json({ error: 'Failed to get response from AI.', details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
