const JSZip = require('jszip');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, grammarFocus, level, studentAge, lessonType, colorScheme } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const isKids = lessonType === 'kids';

  const systemPrompt = `You are an expert English lesson planner for Ukrainian students. You specialize in creating grammar-focused, interactive lessons with exercises, quizzes, and practice activities. Return ONLY valid JSON, no markdown fences, no extra text.`;

  const userPrompt = `Create a complete English lesson plan for ${isKids ? 'kids (ages 9-12)' : 'adults (ages 25+)'}.

Topic: ${topic}
${grammarFocus ? `Grammar Focus: ${grammarFocus} — this is the PRIMARY focus of the lesson. Build all sections around practicing this grammar point.` : ''}
Level: ${level || 'B1 Intermediate'}
Student Age: ${studentAge || (isKids ? '10' : '25-30')}

IMPORTANT: The lesson must be heavily grammar-focused with practical exercises. Every section should reinforce the grammar point.

Return this exact JSON structure:
{
  "lessonTitle": "string — include the grammar point in the title",
  "warmUp": {
    "title": "string",
    "activity": "string — a quick warm-up activity that introduces the grammar concept naturally",
    "content": ["item1", "item2", "item3", "item4"]
  },
  "vocabulary": {
    "title": "string",
    "words": [
      { "word": "string", "translation": "string (Ukrainian translation)", "example": "string — example sentence using the target grammar" }
    ]
  },
  "grammar": {
    "title": "string — name the grammar rule clearly",
    "rule": "string — explain the grammar rule clearly with formula/pattern, e.g. 'Subject + was/were + verb-ing'",
    "examples": ["4 clear example sentences showing the grammar rule, with the grammar structure highlighted using CAPS, e.g. 'She WAS WATCHING TV when I called.'"]
  },
  "practice": {
    "title": "string",
    "type": "fill-in-the-gap",
    "instructions": "string — clear instructions for the exercise",
    "items": ["8 fill-in-the-gap or transformation exercises targeting the grammar point, e.g. 'She ___ (go) to school yesterday. → went'"]
  },
  "speaking": {
    "title": "string",
    "prompt": "string — a speaking task that requires using the target grammar",
    "questions": ["4 discussion questions that force students to use the target grammar structure in their answers"]
  },
  "kahoot": {
    "title": "And of course... your favourite Kahoot! 🎉",
    "suggestion": "string — suggest 4-5 quiz question ideas testing the grammar point"
  }
}

Provide exactly 6 vocabulary words. Make exercises progressive in difficulty. Include Ukrainian translations for vocabulary. Make it engaging and age-appropriate.`;

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
        max_tokens: 2500,
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

    // Strip markdown fences if present
    rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

    const lesson = JSON.parse(rawText);

    // Determine color scheme
    const scheme = colorScheme || (isKids ? 'kids' : 'adults');
    const widgets = buildWidgets(lesson, scheme);

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
    res.setHeader('Content-Disposition', `attachment; filename="${(lesson.lessonTitle || 'lesson').replace(/[^a-zA-Z0-9 ]/g, '')}.rtb"`);
    res.setHeader('X-Lesson-Title', encodeURIComponent(lesson.lessonTitle || 'Lesson'));
    res.send(buffer);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to generate lesson', details: err.message });
  }
};

module.exports.config = { maxDuration: 60 };

const COLOR_SCHEMES = {
  kids: {
    frames: ['#ffe8d6', '#d6eaff', '#e8d6ff', '#d6ffe8', '#fff3cd', '#f0f0f0'],
    vocabCard: '#dbeafe',
    grammarRule: '#e8d6ff',
    grammarExample: '#F5A0C0',
    warmUpSticky: ['#FFE599', '#F5A623'],
    practiceSticky: '#FFE599',
    speakingShape: '#fff3cd',
    speakingSticky: '#FFE599',
    kahootShape: '#e8d6ff',
  },
  adults: {
    frames: ['#e8f4e8', '#fff3cd', '#f8d7da', '#d1ecf1', '#e2d9f3', '#f0f0f0'],
    vocabCard: '#e0f2fe',
    grammarRule: '#f8d7da',
    grammarExample: '#fecaca',
    warmUpSticky: ['#d1fae5', '#a7f3d0'],
    practiceSticky: '#dbeafe',
    speakingShape: '#e2d9f3',
    speakingSticky: '#ede9fe',
    kahootShape: '#e2d9f3',
  },
  ocean: {
    frames: ['#e0f7fa', '#b2ebf2', '#80deea', '#b2dfdb', '#e0f2f1', '#eceff1'],
    vocabCard: '#b2ebf2',
    grammarRule: '#80deea',
    grammarExample: '#4dd0e1',
    warmUpSticky: ['#b2ebf2', '#80deea'],
    practiceSticky: '#b2dfdb',
    speakingShape: '#e0f2f1',
    speakingSticky: '#b2dfdb',
    kahootShape: '#80deea',
  },
  sunset: {
    frames: ['#fff3e0', '#ffe0b2', '#ffccbc', '#f8bbd0', '#e1bee7', '#f3e5f5'],
    vocabCard: '#ffe0b2',
    grammarRule: '#ffccbc',
    grammarExample: '#ef9a9a',
    warmUpSticky: ['#ffe0b2', '#ffcc80'],
    practiceSticky: '#f8bbd0',
    speakingShape: '#e1bee7',
    speakingSticky: '#ce93d8',
    kahootShape: '#e1bee7',
  },
  forest: {
    frames: ['#e8f5e9', '#c8e6c9', '#a5d6a7', '#dcedc8', '#f1f8e9', '#f5f5f5'],
    vocabCard: '#c8e6c9',
    grammarRule: '#a5d6a7',
    grammarExample: '#81c784',
    warmUpSticky: ['#dcedc8', '#c5e1a5'],
    practiceSticky: '#c8e6c9',
    speakingShape: '#dcedc8',
    speakingSticky: '#aed581',
    kahootShape: '#a5d6a7',
  },
  monochrome: {
    frames: ['#f5f5f5', '#eeeeee', '#e0e0e0', '#eeeeee', '#f5f5f5', '#fafafa'],
    vocabCard: '#e0e0e0',
    grammarRule: '#bdbdbd',
    grammarExample: '#e0e0e0',
    warmUpSticky: ['#eeeeee', '#e0e0e0'],
    practiceSticky: '#eeeeee',
    speakingShape: '#e0e0e0',
    speakingSticky: '#eeeeee',
    kahootShape: '#bdbdbd',
  },
};

function buildWidgets(lesson, scheme) {
  const colors = COLOR_SCHEMES[scheme] || COLOR_SCHEMES.kids;
  const widgets = [];
  let idCounter = 1;
  const nextId = () => String(idCounter++);

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
      style: { backgroundColor: colors.frames[i] },
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
  widgets.push({
    id: nextId(),
    type: 'STICKER',
    x: warmUpX,
    y: -430,
    width: 500,
    text: lesson.warmUp.activity,
    style: { stickerBackgroundColor: colors.warmUpSticky[0], fontSize: 16, textAlign: 'center' },
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
        stickerBackgroundColor: colors.warmUpSticky[i % 2],
        fontSize: 18,
        textAlign: 'center',
      },
    });
  }

  // --- Vocabulary (x=950) ---
  const vocabX = 950;
  const words = lesson.vocabulary.words || [];
  for (let i = 0; i < Math.min(words.length, 6); i++) {
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
        backgroundColor: colors.vocabCard,
        backgroundOpacity: 1,
        borderColor: colors.vocabCard,
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
      backgroundColor: colors.grammarRule,
      backgroundOpacity: 1,
      borderColor: colors.grammarRule,
      borderWidth: 2,
      borderOpacity: 1,
      fontSize: 18,
      textColor: '#1a1a2e',
      textAlign: 'center',
    },
  });
  const grammarExamples = lesson.grammar.examples || [];
  for (let i = 0; i < grammarExamples.length; i++) {
    widgets.push({
      id: nextId(),
      type: 'STICKER',
      x: grammarX,
      y: -140 + i * 190,
      width: 600,
      text: grammarExamples[i],
      style: { stickerBackgroundColor: colors.grammarExample, fontSize: 18, textAlign: 'center' },
    });
  }

  // --- Practice (x=2850) ---
  const practiceX = 2850;
  widgets.push({
    id: nextId(),
    type: 'STICKER',
    x: practiceX,
    y: -480,
    width: 600,
    text: `${(lesson.practice.type || 'EXERCISE').toUpperCase()}\n${lesson.practice.instructions}`,
    style: { stickerBackgroundColor: colors.practiceSticky, fontSize: 14, textAlign: 'center' },
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
      style: { stickerBackgroundColor: colors.practiceSticky, fontSize: 16, textAlign: 'center' },
    });
  }

  // --- Speaking (x=3800) ---
  const speakingX = 3800;
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
      backgroundColor: colors.speakingShape,
      backgroundOpacity: 1,
      borderColor: colors.speakingShape,
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
      style: { stickerBackgroundColor: colors.speakingSticky, fontSize: 18, textAlign: 'center' },
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
      backgroundColor: colors.kahootShape,
      backgroundOpacity: 1,
      borderColor: colors.kahootShape,
      borderWidth: 2,
      borderOpacity: 1,
      fontSize: 20,
      textColor: '#1a1a2e',
      textAlign: 'center',
    },
  });
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
