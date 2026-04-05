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
    "title": "And of course... your favourite Kahoot!",
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
        model: 'claude-sonnet-4-20250514',
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
    const { shapes, stickers, texts, order } = buildWidgets(lesson, scheme);

    // Build proper .rtb file (ZIP with 4 JSON files)
    const metaJson = { version: '1.3' };

    const boardJson = {
      name: lesson.lessonTitle || 'English Lesson',
      description: `Generated lesson: ${topic}`,
      isPublic: false,
      iconResourceId: 0,
      id: -Math.floor(Math.random() * 9000000000000000000) - 1000000000000000000,
    };

    const canvasJson = {
      id: 0,
      widgets: {
        order: order,
        objects: {
          curves: [],
          documents: [],
          images: [],
          lines: [],
          mockups: [],
          shapes: shapes,
          stickers: stickers,
          texts: texts,
          videos: [],
          webScreenshots: [],
          linkPreviews: [],
          embeds: [],
          jiraCards: [],
          rallyWidgets: [],
          customWidgets: [],
        },
      },
      comments: [],
      links: [],
      groups: [],
      camera: {
        a: { x: -500, y: -900 },
        b: { x: 5500, y: 900 },
      },
      presentationVisible: false,
      presentation: [],
      labels: [],
      emojis: {},
      widgetsAliases: [],
    };

    const resourcesJson = { resources: [] };

    const zip = new JSZip();
    zip.file('meta.json', JSON.stringify(metaJson));
    zip.file('board.json', JSON.stringify(boardJson));
    zip.file('canvas.json', JSON.stringify(canvasJson));
    zip.file('resources.json', JSON.stringify(resourcesJson));

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

// Convert hex color string to integer
function hexToInt(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

// Generate a large unique ID for Miro widgets
let idBase = 3074457352748360000;
function nextWidgetId() {
  return idBase++;
}

const COLOR_SCHEMES = {
  kids: {
    stickyColors: [16775601, 16098851, 16087232], // light_yellow, light_orange, light_pink
    shapeColor: hexToInt('#dbeafe'),
    grammarShapeColor: hexToInt('#e8d6ff'),
    titleColor: hexToInt('#1a1a2e'),
    greenSticky: hexToInt('#B8E986'),
  },
  adults: {
    stickyColors: [hexToInt('#d1fae5'), hexToInt('#a7f3d0'), hexToInt('#dbeafe')],
    shapeColor: hexToInt('#e0f2fe'),
    grammarShapeColor: hexToInt('#f8d7da'),
    titleColor: hexToInt('#1a1a2e'),
    greenSticky: hexToInt('#B8E986'),
  },
  ocean: {
    stickyColors: [hexToInt('#b2ebf2'), hexToInt('#80deea'), hexToInt('#b2dfdb')],
    shapeColor: hexToInt('#b2ebf2'),
    grammarShapeColor: hexToInt('#80deea'),
    titleColor: hexToInt('#1a1a2e'),
    greenSticky: hexToInt('#B8E986'),
  },
  sunset: {
    stickyColors: [hexToInt('#ffe0b2'), hexToInt('#ffcc80'), hexToInt('#f8bbd0')],
    shapeColor: hexToInt('#ffe0b2'),
    grammarShapeColor: hexToInt('#ffccbc'),
    titleColor: hexToInt('#1a1a2e'),
    greenSticky: hexToInt('#B8E986'),
  },
  forest: {
    stickyColors: [hexToInt('#dcedc8'), hexToInt('#c5e1a5'), hexToInt('#c8e6c9')],
    shapeColor: hexToInt('#c8e6c9'),
    grammarShapeColor: hexToInt('#a5d6a7'),
    titleColor: hexToInt('#1a1a2e'),
    greenSticky: hexToInt('#B8E986'),
  },
  monochrome: {
    stickyColors: [hexToInt('#eeeeee'), hexToInt('#e0e0e0'), hexToInt('#f5f5f5')],
    shapeColor: hexToInt('#e0e0e0'),
    grammarShapeColor: hexToInt('#bdbdbd'),
    titleColor: hexToInt('#1a1a2e'),
    greenSticky: hexToInt('#B8E986'),
  },
};

function makeText(x, y, text, opts = {}) {
  const id = nextWidgetId();
  return {
    id,
    widget: {
      x, y,
      rotation: 0.0,
      scale: opts.scale || 1.0,
      width: opts.width || 300,
      height: opts.height || 36,
      style: {
        st: 14,
        bc: -1,
        bo: 1,
        brc: -1,
        bro: 1,
        brw: 0,
        brs: 2,
        bsc: 0,
        ta: opts.align || 'c',
        tc: opts.color || hexToInt('#1a1a2e'),
        tsc: 0,
        ffn: 10,
        b: opts.bold ? 1 : 0,
        i: 0,
        u: 0,
        s: 0,
        fw: opts.bold ? 1 : 0,
      },
      text: `<p>${opts.bold ? '<strong>' : ''}${text}${opts.bold ? '</strong>' : ''}</p>`,
      id,
    },
  };
}

function makeSticker(x, y, text, bgColor, opts = {}) {
  const id = nextWidgetId();
  const w = opts.width || 200;
  const h = opts.height || 228;
  return {
    id,
    widget: {
      x, y,
      width: w,
      height: h,
      scale: opts.scale || 0.8,
      style: {
        sbc: bgColor,
        ffn: 10,
        fs: opts.fontSize || 18,
        fsa: 0,
        ta: 'c',
        tav: 'm',
        taw: w - 40,
        tah: h - 40,
        lh: 1.36,
      },
      text: `<p>${text}</p>`,
      id,
    },
  };
}

function makeShape(x, y, w, h, text, bgColor, opts = {}) {
  const id = nextWidgetId();
  return {
    id,
    widget: {
      x, y,
      rotation: 0.0,
      width: w,
      height: h,
      style: {
        st: 22, // rounded rectangle
        ffn: 10,
        fs: opts.fontSize || 18,
        b: opts.bold ? 1 : 0,
        i: 0,
        u: 0,
        s: 0,
        bc: bgColor,
        bo: 1,
        brc: bgColor,
        bro: 1,
        brw: 2,
        brs: 2,
        tc: opts.textColor || hexToInt('#1a1a2e'),
        ta: 'c',
        tav: 'm',
        tsc: 0,
        bsc: 0,
        VER: 2,
      },
      text: `<p>${text.replace(/\n/g, '</p><p>')}</p>`,
      type: '22',
      id,
    },
  };
}

function buildWidgets(lesson, scheme) {
  const colors = COLOR_SCHEMES[scheme] || COLOR_SCHEMES.kids;
  const shapes = [];
  const stickers = [];
  const texts = [];
  const order = [];

  function addText(x, y, text, opts) {
    const t = makeText(x, y, text, opts);
    texts.push(t.widget);
    order.push(t.id);
  }

  function addSticker(x, y, text, bgColor, opts) {
    const s = makeSticker(x, y, text, bgColor, opts);
    stickers.push(s.widget);
    order.push(s.id);
  }

  function addShape(x, y, w, h, text, bgColor, opts) {
    const s = makeShape(x, y, w, h, text, bgColor, opts);
    shapes.push(s.widget);
    order.push(s.id);
  }

  const sectionNames = ['Warm Up', 'Vocabulary', 'Grammar', 'Practice', 'Speaking', 'Kahoot'];
  const sectionXOffsets = [0, 950, 1900, 2850, 3800, 4750];

  // Lesson title
  addText(2375, -750, lesson.lessonTitle, { bold: true, scale: 3.0, width: 400 });

  // Section titles
  for (let i = 0; i < 6; i++) {
    addText(sectionXOffsets[i], -550, sectionNames[i], { bold: true, scale: 2.0, width: 300 });
  }

  // --- Warm Up (x=0) ---
  const warmUpX = 0;
  addSticker(warmUpX, -430, lesson.warmUp.activity, colors.stickyColors[0], { width: 300, height: 200, scale: 1.0 });
  const warmUpItems = lesson.warmUp.content || [];
  for (let i = 0; i < warmUpItems.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    addSticker(
      warmUpX + (col === 0 ? -160 : 160),
      -200 + row * 220,
      warmUpItems[i],
      colors.stickyColors[i % 2 === 0 ? 0 : 1],
      { width: 250, height: 200 }
    );
  }

  // --- Vocabulary (x=950) ---
  const vocabX = 950;
  const words = lesson.vocabulary.words || [];
  for (let i = 0; i < Math.min(words.length, 6); i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const w = words[i];
    addShape(
      vocabX + (col === 0 ? -170 : 170),
      -380 + row * 270,
      310, 230,
      `${w.word}\n${w.translation}\n\n"${w.example}"`,
      colors.shapeColor
    );
  }

  // --- Grammar (x=1900) ---
  const grammarX = 1900;
  addShape(grammarX, -380, 680, 160, lesson.grammar.rule, colors.grammarShapeColor, { bold: true });
  const grammarExamples = lesson.grammar.examples || [];
  for (let i = 0; i < grammarExamples.length; i++) {
    addSticker(grammarX, -140 + i * 190, grammarExamples[i], colors.stickyColors[2], { width: 350, height: 150, scale: 1.0 });
  }

  // --- Practice (x=2850) ---
  const practiceX = 2850;
  addSticker(practiceX, -480, `${(lesson.practice.type || 'EXERCISE').toUpperCase()}: ${lesson.practice.instructions}`, colors.stickyColors[0], { width: 350, height: 200, scale: 1.0 });
  const practiceItems = lesson.practice.items || [];
  for (let i = 0; i < practiceItems.length; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    addSticker(
      practiceX + (col === 0 ? -170 : 170),
      -260 + row * 180,
      practiceItems[i],
      colors.stickyColors[i % 2],
      { width: 280, height: 150 }
    );
  }

  // --- Speaking (x=3800) ---
  const speakingX = 3800;
  addShape(speakingX, -430, 680, 120, lesson.speaking.prompt, colors.shapeColor);
  const speakingQuestions = lesson.speaking.questions || [];
  for (let i = 0; i < speakingQuestions.length; i++) {
    addSticker(speakingX, -260 + i * 200, speakingQuestions[i], colors.stickyColors[0], { width: 350, height: 160, scale: 1.0 });
  }

  // --- Kahoot (x=4750) ---
  const kahootX = 4750;
  addShape(kahootX, -300, 680, 260, `${lesson.kahoot.title}\n\n${lesson.kahoot.suggestion}`, colors.grammarShapeColor);
  addSticker(kahootX, 50, 'Well done! You did amazing today!', colors.greenSticky, { width: 280, height: 200, scale: 1.0 });

  return { shapes, stickers, texts, order };
}
