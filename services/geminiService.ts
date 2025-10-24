
import { GoogleGenAI } from '@google/genai';
import { CivicIssue } from '../types';

const getAi = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        throw new Error("API_KEY environment variable is not set.");
    }
    return new GoogleGenAI({ apiKey });
}

export const getChatbotResponse = async (issue: CivicIssue | undefined, issueId: string, userLocation?: { lat: number; lng: number }): Promise<string> => {
  const ai = getAi();
  
  let prompt: string;
  let toolConfig: any = undefined;

  if (userLocation) {
    toolConfig = {
      retrievalConfig: {
        latLng: {
          latitude: userLocation.lat,
          longitude: userLocation.lng
        }
      }
    };
  }

  if (issue) {
    prompt = `You are a friendly and helpful city service chatbot. A citizen is asking for the status of their complaint with ID "${issueId}". The complaint is about "${issue.title}" at location (lat: ${issue.location.lat}, lng: ${issue.location.lng}) and its current status is "${issue.status}". Please provide a helpful and reassuring response. If the status is 'Pending', mention it has been received and is in the queue. If 'In Progress', say that our team is actively working on it. If 'Resolved', thank them for their patience and confirm the issue is fixed. Keep the response concise and positive. If possible, mention nearby landmarks or areas to give the user more context about the location of the issue.`;
  } else {
    prompt = `You are a friendly and helpful city service chatbot. A citizen is asking for the status of their complaint with ID "${issueId}", but this ID was not found in our system. Please provide a polite response informing them that the complaint ID is invalid. Ask them to double-check the ID and try again. Suggest they can report a new issue if they can't find their ID.`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{googleMaps: {}}],
        toolConfig,
      },
    });
    
    let responseText = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

    if (groundingChunks && issue) {
        const uris = new Set<string>();
        groundingChunks.forEach((chunk: any) => {
            if (chunk.maps?.uri) {
                uris.add(chunk.maps.uri);
            }
        });
        if (uris.size > 0) {
            responseText += `\n\n**More Info:**\n`;
            uris.forEach(uri => {
                responseText += `- [View on Google Maps](${uri})\n`;
            });
        }
    }
    return responseText;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "I'm sorry, I'm having trouble connecting to my services right now. Please try again in a moment.";
  }
};


export const summarizeResolvedIssues = async (issues: CivicIssue[]): Promise<string> => {
  if (issues.length === 0) {
    return "No issues have been marked as resolved yet. Check back soon!";
  }

  const ai = getAi();
  
  const locations = issues.map(issue => ` - ${issue.title} at (lat: ${issue.location.lat}, lng: ${issue.location.lng})`).join('\n');
  
  const prompt = `You are a helpful city service AI. Here is a list of recently resolved civic issues and their locations:\n${locations}\n\nPlease provide a short, engaging summary for the public dashboard, mentioning the general areas or neighborhoods where these issues were fixed. Be positive and community-focused. Do not list every single issue, but give a high-level overview. For example, 'Our teams were busy this week! We've resolved several issues, including pothole repairs in the downtown core and clearing garbage from the beautiful riverside park.'`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{googleMaps: {}}],
      },
    });
    
    let summary = response.text;
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      const uris = new Set<string>();
      groundingChunks.forEach((chunk: any) => {
        if (chunk.maps?.uri) {
          uris.add(chunk.maps.uri);
        }
        if (chunk.maps?.placeAnswerSources) {
          chunk.maps.placeAnswerSources.forEach((source: any) => {
            if (source.reviewSnippets) {
              source.reviewSnippets.forEach((snippet: any) => {
                if (snippet.uri) {
                  uris.add(snippet.uri);
                }
              });
            }
          });
        }
      });

      if (uris.size > 0) {
        summary += '\n\n**Sources from Google Maps:**\n';
        uris.forEach(uri => {
          summary += ` - [View related area](${uri})\n`;
        });
      }
    }
    
    return summary;
  } catch (error) {
    console.error("Error calling Gemini API for summary:", error);
    return "We've been hard at work resolving issues across the city!";
  }
};
