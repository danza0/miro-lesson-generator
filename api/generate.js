module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, prevTopic, grammarFocus, level, studentAge, lessonType, youtubeUrls, duration } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const isKids = lessonType === 'kids';

  const systemPrompt = `You are an expert English lesson planner for Ukrainian students. You specialize in creating grammar-focused, interactive lessons with exercises, quizzes, and practice activities. Return ONLY valid JSON, no markdown fences, no extra text.`;

  const userPrompt = `Create a complete English lesson plan for ${isKids ? 'kids (ages 9-12)' : 'adults (ages 25+)'}.

Topic: ${topic}
${prevTopic ? `Previous Lesson Topic: ${prevTopic} — Use this for the WARM UP section. The warm-up should review/revisit the previous topic as a bridge into today's lesson. Students already know this material, so use it for quick review activities.` : ''}
${grammarFocus ? `Grammar Focus: ${grammarFocus} — this is the PRIMARY focus of the lesson. Build all sections around practicing this grammar point.` : ''}
Level: ${level || 'B1 Intermediate'}
Student Age: ${studentAge || (isKids ? '10' : '25-30')}

Lesson Duration: ${duration || 30} minutes. Adjust the amount of content accordingly:
- 10-15 min: 4 vocabulary words, 4 practice items, 3 quiz questions, shorter warm-up
- 20-30 min: 6 vocabulary words, 8 practice items, 5 quiz questions (standard)
- 35-45 min: 8 vocabulary words, 10 practice items, 6 quiz questions, more speaking questions
- 50-60 min: 10 vocabulary words, 12 practice items, 8 quiz questions, extra examples

IMPORTANT: The lesson must be heavily grammar-focused with practical exercises. Every section should reinforce the grammar point.

Return this exact JSON structure:
{
  "lessonTitle": "string — include the grammar point in the title",
  "warmUp": {
    "title": "Warm Up",
    "activity": "string — a quick warm-up activity description",
    "content": ["item1", "item2", "item3", "item4"]
  },
  "vocabulary": {
    "title": "Vocabulary",
    "words": [
      { "word": "string", "translation": "string (Ukrainian translation)", "example": "string — example sentence using the target grammar", "partOfSpeech": "noun/verb/adjective/etc" }
    ]
  },
  "grammar": {
    "title": "Grammar",
    "ruleName": "string — short name like 'Past Simple: was/were'",
    "rule": "string — explain the grammar rule clearly with formula/pattern",
    "formula": "string — the formula like 'Subject + was/were + ...'",
    "positiveExamples": ["2 positive example sentences"],
    "negativeExamples": ["2 negative example sentences"],
    "questionExamples": ["2 question example sentences"]
  },
  "practice": {
    "title": "Practice",
    "type": "fill-in-the-gap",
    "instructions": "string — clear instructions for the exercise",
    "items": [
      { "sentence": "She ___ happy yesterday.", "answer": "was" },
      { "sentence": "They ___ at school last Monday.", "answer": "were" }
    ]
  },
  "speaking": {
    "title": "Speaking",
    "prompt": "string — a speaking task that requires using the target grammar",
    "questions": ["4 discussion questions that force students to use the target grammar structure"]
  },
  "kahoot": {
    "title": "Quiz Time!",
    "questions": [
      { "question": "string", "options": ["A", "B", "C", "D"], "correct": 0 }
    ]
  }
}

Adjust the number of items based on the lesson duration specified above.
Make exercises progressive in difficulty. Include Ukrainian translations. Make it engaging and age-appropriate.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Claude API error:', err);
      return res.status(500).json({ error: 'Claude API error', details: err });
    }

    const data = await anthropicRes.json();
    let rawText = data.content[0].text;

    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const lesson = JSON.parse(rawText);

    // Parse YouTube URLs
    const videos = [];
    if (youtubeUrls) {
      const urls = youtubeUrls.split(/[,\n]/).map(u => u.trim()).filter(Boolean);
      for (const url of urls) {
        const id = extractYouTubeId(url);
        if (id) videos.push(id);
      }
    }

    lesson.videos = videos;
    lesson.lessonType = lessonType;
    lesson.level = level;
    lesson.studentAge = studentAge;

    res.status(200).json(lesson);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to generate lesson', details: err.message });
  }
};

module.exports.config = { maxDuration: 60 };

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
