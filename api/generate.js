import JSZip from 'jszip';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, grammarFocus, level, studentAge, lessonType } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const isKids = lessonType === 'kids';

  const systemPrompt = `You are an expert English lesson planner for Ukrainian students. Return ONLY valid JSON, no markdown fences, no extra text.`;

  const userPrompt = `Create a complete English lesson plan for ${isKids ? 'kids (ages 9-12)' : 'adults (ages 25+)'}.

Topic: ${topic}
${grammarFocus ? `Grammar Focus: ${grammarFocus}` : ''}
Level: ${level || 'B1 Intermediate'}
Student Age: ${studentAge || (isKids ? '10' : '25-30')}

Return this exact JSON structure:
{
  "lessonTitle": "string",
  "warmUp": {
    "title": "string",
    "activity": "string",
    "content": ["item1", "item2", "item3", "item4"]
  },
  "vocabulary": {
    "title": "string",
    "words": [
      { "word": "string", "translation": "string (Ukrainian translation)", "example": "string" },
      { "word": "string", "translation": "string", "example": "string" },
      { "word": "string", "translation": "string", "example": "string" },
      { "word": "string", "translation": "string", "example": "string" },
      { "word": "string", "translation": "string", "example": "string" },
      { "word": "string", "translation": "string", "example": "string" }
    ]
  },
  "grammar": {
    "title": "string",
    "rule": "string",
    "examples": ["string", "string", "string", "string"]
  },
  "practice": {
    "title": "string",
    "type": "fill-in-the-gap | conversation | agree-disagree",
    "instructions": "string",
    "items": ["string", "string", "string", "string", "string", "string", "string", "string"]
  },
  "speaking": {
    "title": "string",
    "prompt": "string",
    "questions": ["string", "string", "string", "string"]
  },
  "kahoot": {
    "title": "And of course... your favourite Kahoot! \ud83c\udf89",
    "suggestion": "string"
  }
}

Make it engaging, age-appropriate, and focused on the topic. Include Ukrainian translations for vocabulary. For practice type, choose the most appropriate one for the topic.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20241022',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt,
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      return res.status(500).json({ error: 'Claude API error', details: err });
    }

    const data = await anthropicRes.json();
    let rawText = data.content[0].text;

    // Strip markdown fences if present
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const lesson = JSON.parse(rawText);

    // Build Miro board widgets
    const widgets = buildWidgets(lesson, isKids);

    const boardJson = {
      version: '2.7',
      metadata: { created: Date.now() },
      type: 'board',
      widgets,
    };

    const zip = new JSZip();
    zip.file('board', JSON.stringify(boardJson));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${lesson.lessonTitle || 'lesson'}.rtb"`);
    res.setHeader('X-Lesson-Title', encodeURIComponent(lesson.lessonTitle || 'Lesson'));
    res.send(buffer);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to generate lesson', details: err.message });
  }
}

function buildWidgets(lesson, isKids) {
  const widgets = [];
  let idCounter = 1;
  const nextId = () => String(idCounter++);

  const sectionColors = isKids
    ? ['#ffe8d6', '#d6eaff', '#e8d6ff', '#d6ffe8', '#fff3cd', '#f0f0f0']
    : ['#e8f4e8', '#fff3cd', '#f8d7da', '#d1ecf1', '#e2d9f3', '#f0f0f0'];

  const sectionNames = ['Warm Up', 'Vocabulary', 'Grammar', 'Practice', 'Speaking', 'Kahoot'];
  const sectionXOffsets = [0, 950, 1900, 2850, 3800, 4750];

  // Lesson title
  widgets.push({
    id: nextId(),
    type: 'TEXT',
    x: 2375,
    y: -750,
    width: 1200,
    text: `<b>${lesson.lessonTitle}</b>`,
    fontSize: 36,
    textColor: '#1a1a2e',
    textAlign: 'center',
    scale: 1,
  });

  // Create frames and section titles
  for (let i = 0; i < 6; i++) {
    widgets.push({
      id: nextId(),
      type: 'FRAME',
      x: sectionXOffsets[i],
      y: 0,
      width: 800,
      height: 1300,
      title: '',
      style: { backgroundColor: sectionColors[i] },
    });

    widgets.push({
      id: nextId(),
      type: 'TEXT',
      x: sectionXOffsets[i],
      y: -550,
      width: 700,
      text: `<b>${sectionNames[i]}</b>`,
      fontSize: 28,
      textColor: '#1a1a2e',
      textAlign: 'center',
      scale: 1,
    });
  }

  // --- Warm Up (x=0) ---
  const warmUpX = 0;
  const warmUpItems = lesson.warmUp.content || [];
  // Activity description
  widgets.push({
    id: nextId(),
    type: 'STICKER',
    x: warmUpX,
    y: -430,
    width: 500,
    text: lesson.warmUp.activity,
    style: { stickerBackgroundColor: '#FFE599', fontSize: 16, textAlign: 'center' },
  });
  for (let i = 0; i < warmUpItems.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    widgets.push({
      id: nextId(),
      type: 'STICKER',
      x: warmUpX + (col === 0 ? -160 : 160),
      y: -300 + row * 220,
      width: 280,
      text: warmUpItems[i],
      style: {
        stickerBackgroundColor: i % 2 === 0 ? '#FFE599' : '#F5A623',
        fontSize: 18,
        textAlign: 'center',
      },
    });
  }

  // --- Vocabulary (x=950) ---
  const vocabX = 950;
  const words = lesson.vocabulary.words || [];
  for (let i = 0; i < words.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const w = words[i];
    widgets.push({
      id: nextId(),
      type: 'SHAPE',
      x: vocabX + (col === 0 ? -170 : 170),
      y: -380 + row * 270,
      width: 310,
      height: 230,
      text: `${w.word}\n${w.translation}\n\n"${w.example}"`,
      style: {
        shapeType: 'round_rectangle',
        backgroundColor: '#dbeafe',
        backgroundOpacity: 1,
        borderColor: '#dbeafe',
        borderWidth: 2,
        borderOpacity: 1,
        fontSize: 18,
        textColor: '#1a1a2e',
        textAlign: 'center',
      },
    });
  }

  // --- Grammar (x=1900) ---
  const grammarX = 1900;
  // Rule shape
  widgets.push({
    id: nextId(),
    type: 'SHAPE',
    x: grammarX,
    y: -380,
    width: 680,
    height: 160,
    text: lesson.grammar.rule,
    style: {
      shapeType: 'round_rectangle',
      backgroundColor: '#e8d6ff',
      backgroundOpacity: 1,
      borderColor: '#e8d6ff',
      borderWidth: 2,
      borderOpacity: 1,
      fontSize: 18,
      textColor: '#1a1a2e',
      textAlign: 'center',
    },
  });
  // Examples
  const grammarExamples = lesson.grammar.examples || [];
  for (let i = 0; i < grammarExamples.length; i++) {
    widgets.push({
      id: nextId(),
      type: 'STICKER',
      x: grammarX,
      y: -140 + i * 190,
      width: 600,
      text: grammarExamples[i],
      style: { stickerBackgroundColor: '#F5A0C0', fontSize: 18, textAlign: 'center' },
    });
  }

  // --- Practice (x=2850) ---
  const practiceX = 2850;
  // Instructions
  widgets.push({
    id: nextId(),
    type: 'STICKER',
    x: practiceX,
    y: -480,
    width: 600,
    text: `${lesson.practice.type.toUpperCase()}\n${lesson.practice.instructions}`,
    style: { stickerBackgroundColor: '#FFE599', fontSize: 14, textAlign: 'center' },
  });
  const practiceItems = lesson.practice.items || [];
  for (let i = 0; i < practiceItems.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    widgets.push({
      id: nextId(),
      type: 'STICKER',
      x: practiceX + (col === 0 ? -170 : 170),
      y: -340 + row * 200,
      width: 300,
      text: practiceItems[i],
      style: { stickerBackgroundColor: '#FFE599', fontSize: 16, textAlign: 'center' },
    });
  }

  // --- Speaking (x=3800) ---
  const speakingX = 3800;
  // Prompt shape
  widgets.push({
    id: nextId(),
    type: 'SHAPE',
    x: speakingX,
    y: -430,
    width: 680,
    height: 120,
    text: lesson.speaking.prompt,
    style: {
      shapeType: 'round_rectangle',
      backgroundColor: '#fff3cd',
      backgroundOpacity: 1,
      borderColor: '#fff3cd',
      borderWidth: 2,
      borderOpacity: 1,
      fontSize: 18,
      textColor: '#1a1a2e',
      textAlign: 'center',
    },
  });
  const speakingQuestions = lesson.speaking.questions || [];
  for (let i = 0; i < speakingQuestions.length; i++) {
    widgets.push({
      id: nextId(),
      type: 'STICKER',
      x: speakingX,
      y: -260 + i * 200,
      width: 600,
      text: speakingQuestions[i],
      style: { stickerBackgroundColor: '#FFE599', fontSize: 18, textAlign: 'center' },
    });
  }

  // --- Kahoot (x=4750) ---
  const kahootX = 4750;
  widgets.push({
    id: nextId(),
    type: 'SHAPE',
    x: kahootX,
    y: -300,
    width: 680,
    height: 260,
    text: `${lesson.kahoot.title}\n\n${lesson.kahoot.suggestion}`,
    style: {
      shapeType: 'round_rectangle',
      backgroundColor: '#e8d6ff',
      backgroundOpacity: 1,
      borderColor: '#e8d6ff',
      borderWidth: 2,
      borderOpacity: 1,
      fontSize: 20,
      textColor: '#1a1a2e',
      textAlign: 'center',
    },
  });
  // Well done sticky
  widgets.push({
    id: nextId(),
    type: 'STICKER',
    x: kahootX,
    y: 50,
    width: 400,
    text: 'Well done! You did amazing today! \u2b50',
    style: { stickerBackgroundColor: '#B8E986', fontSize: 22, textAlign: 'center' },
  });

  return widgets;
}
