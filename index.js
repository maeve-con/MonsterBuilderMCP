import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import * as z from 'zod';
import fs from 'fs';

const NOTES_PATH = './design_notes.json';

// Create the server
const server = new McpServer({
    name: 'phaser-monster-tools',
    version: '1.0.0',
});

const wss = new WebSocketServer({ port: 8081 });
let gameSocket = null;
const pending = new Map();
let nextId = 1;

wss.on('connection', (ws) => {
    console.error('[bridge] Phaser game connected');
    gameSocket = ws;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const resolve = pending.get(msg.id);
        if (resolve) {
            resolve(msg);
            pending.delete(msg.id);
        }
    });

    ws.on('close', () => {
        console.error('[bridge] game disconnected');
        if (gameSocket === ws) gameSocket = null;
    });
});

// Send a command to the game and wait for its reply
function sendToGame(command, params = {}) {
    return new Promise((resolve, reject) => {
        if (!gameSocket) {
            reject(new Error('No game connected. Is the game page open in your browser?'));
            return;
        }
        const id = nextId++;
        pending.set(id, resolve);
        gameSocket.send(JSON.stringify({ id, command, params }));

        // Don't wait forever
        setTimeout(() => {
            if (pending.delete(id)) {
                reject(new Error('Game did not respond within 5 seconds.'));
            }
        }, 5000);
    });
}

const eyeStyles = [
    'angry_blue', 'angry_green', 'angry_red',
    'blue', 'red', 'yellow',
    'closed_feminine', 'closed_happy',
    'cute_dark', 'cute_light',
    'dead',
    'human_blue', 'human_green', 'human_red', 'human',
    'psycho_dark', 'psycho_light',
];

const visualModifiers = {
    tint: z.string().optional()
        .describe('Hex color to tint this part, e.g. "#8833ff". Tint is MULTIPLICATIVE, not a repaint: ' +
            'each color channel of the tint is multiplied against the sprite\'s own pixel channels. ' +
            'Tinting a dark base texture only darkens it further — tinting a dark part with saddle-brown ' +
            '"#cd853f" pushes it toward mud, not brown — a tint\'s own hue only comes through reliably on ' +
            'lighter/brighter base colors. White "#ffffff" tint is always a no-op (multiplying by 255 changes nothing). ' +
            'Call describe_monster_colors to see the actual computed effective color and brightness before committing.'),
    scale: z.coerce.number().optional()
        .describe('Uniform scale factor, e.g. 1.5 = 50% bigger, 0.6 = smaller. Overridden per-axis by scaleX/scaleY if given.'),
    scaleX: z.coerce.number().optional()
        .describe('Horizontal scale factor. Combine with scaleY for non-uniform stretching, e.g. a thin part.'),
    scaleY: z.coerce.number().optional()
        .describe('Vertical scale factor. Combine with scaleX for non-uniform stretching, e.g. scaleY: 1.6 for a long/tall part.'),
    angle: z.coerce.number().optional()
        .describe('Rotation in degrees applied to this part (positive = clockwise).'),
    dx: z.coerce.number().optional()
        .describe('Horizontal pixel nudge from this part\'s default attachment point. For mirrored parts (arms/legs), positive dx widens the pair (each side moves further out).'),
    dy: z.coerce.number().optional()
        .describe('Vertical pixel nudge from this part\'s default attachment point (positive = down).'),
};

const withModifiers = (shape) => shape.extend(visualModifiers);

// --- Register tools
server.registerTool(
    'create_body',
    {
        description: 'Create the monster body. Must be called before adding any other parts. Replaces any existing monster. ' +
            'Supports optional visual modifiers: tint (multiplicative hex color — darkens more than it repaints, see the tint parameter), ' +
            'scale/scaleX/scaleY (size), angle (rotation), dx/dy (offset from center).',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant: A=square, B=round, C=oval, D=squat oval, E=long body, F=long body with hair tufts'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('create_body', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_arms',
    {
        description: 'Add arms to the monster. Requires create_body to have been called first. ' +
            'By default adds a mirrored pair using color/pose/tint/scale/angle/dx/dy. ' +
            'Set mirror:false with only the Right* fields to add a single asymmetric arm. ' +
            'Use the *Left/*Right override fields to give each arm a different color, pose, size, angle, or position.',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Default arm color, dark=brown'),
            pose: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Default arm shape variant'),
            mirror: z.boolean().default(true)
                .describe('If false, only the right arm is placed (use for a single asymmetric limb). Default true adds both sides.'),
            colorLeft: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional().describe('Override left arm color'),
            colorRight: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional().describe('Override right arm color'),
            poseLeft: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('Override left arm pose'),
            poseRight: z.enum(['A', 'B', 'C', 'D', 'E']).optional().describe('Override right arm pose'),
            tintLeft: z.string().optional().describe('Override left arm tint — multiplicative (see the base tint parameter): darkens dark arm colors more than it repaints them.'),
            tintRight: z.string().optional().describe('Override right arm tint — multiplicative (see the base tint parameter): darkens dark arm colors more than it repaints them.'),
            scaleLeft: z.coerce.number().optional().describe('Override left arm scale'),
            scaleRight: z.coerce.number().optional().describe('Override right arm scale'),
            angleLeft: z.coerce.number().optional().describe('Override left arm rotation in degrees'),
            angleRight: z.coerce.number().optional().describe('Override right arm rotation in degrees'),
            dxLeft: z.coerce.number().optional().describe('Override left arm horizontal offset from its own anchor'),
            dxRight: z.coerce.number().optional().describe('Override right arm horizontal offset from its own anchor'),
            dyLeft: z.coerce.number().optional().describe('Override left arm vertical offset from its own anchor'),
            dyRight: z.coerce.number().optional().describe('Override right arm vertical offset from its own anchor'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_arms', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_legs',
    {
        description: 'Add legs to the monster. Requires create_body to have been called first. ' +
            'By default adds a mirrored pair. Set mirror:false with only the Right* fields for a single asymmetric leg. ' +
            'Use stance for a quick low/high leg placement instead of guessing dy by hand.',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Default leg color, dark=brown'),
            pose: z.enum(['A', 'B', 'C']).describe('Default leg shape variant'),
            stance: z.enum(['low', 'normal', 'high']).default('normal')
                .describe('Quick vertical placement preset: low=squat/creature-like, high=long-legged/humanoid. Stacks with dy for finer control.'),
            mirror: z.boolean().default(true)
                .describe('If false, only the right leg is placed. Default true adds both sides.'),
            colorLeft: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional().describe('Override left leg color'),
            colorRight: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional().describe('Override right leg color'),
            poseLeft: z.enum(['A', 'B', 'C']).optional().describe('Override left leg pose'),
            poseRight: z.enum(['A', 'B', 'C']).optional().describe('Override right leg pose'),
            tintLeft: z.string().optional().describe('Override left leg tint — multiplicative (see the base tint parameter): darkens dark leg colors more than it repaints them.'),
            tintRight: z.string().optional().describe('Override right leg tint — multiplicative (see the base tint parameter): darkens dark leg colors more than it repaints them.'),
            scaleLeft: z.coerce.number().optional().describe('Override left leg scale'),
            scaleRight: z.coerce.number().optional().describe('Override right leg scale'),
            angleLeft: z.coerce.number().optional().describe('Override left leg rotation in degrees'),
            angleRight: z.coerce.number().optional().describe('Override right leg rotation in degrees'),
            dxLeft: z.coerce.number().optional().describe('Override left leg horizontal offset from its own anchor'),
            dxRight: z.coerce.number().optional().describe('Override right leg horizontal offset from its own anchor'),
            dyLeft: z.coerce.number().optional().describe('Override left leg vertical offset from its own anchor'),
            dyRight: z.coerce.number().optional().describe('Override right leg vertical offset from its own anchor'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_legs', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

const eyePositionOverride = z.object({
    style: z.enum(eyeStyles).optional(),
    tint: z.string().optional()
        .describe('Per-eye tint override — multiplicative (see the top-level tint parameter): darkens dark eye styles more than it repaints them.'),
    scale: z.coerce.number().optional(),
    angle: z.coerce.number().optional(),
    dx: z.coerce.number().optional(),
    dy: z.coerce.number().optional(),
});

server.registerTool(
    'add_eyes',
    {
        description: 'Add one or more eyes to the monster, evenly spaced by default. Requires create_body to have been called first. ' +
            'Use positions to override individual eyes (different style/scale/tint/angle/offset per eye, indexed left to right). ' +
            'Use dominant:true to make the first eye a focal feature auto-scaled to 1.4x instead of guessing scale by hand.',
        inputSchema: withModifiers(z.object({
            style: z.enum(eyeStyles).describe('Default eye style, some include a color (e.g. angry_blue), others do not (e.g. dead, human)'),
            count: z.number().int().min(1).max(6).default(2).describe('Number of eyes, e.g. 1 for a cyclops, 2 for normal, 3+ for something stranger'),
            dominant: z.boolean().default(false)
                .describe('If true, eye index 0 is auto-scaled to 1.4x as a focal feature. Overridden by positions[0].scale if given.'),
            positions: z.array(eyePositionOverride).optional()
                .describe('Per-eye overrides, indexed left-to-right, e.g. [{}, {scale:1.6, style:"dead"}] for one huge dead eye among normal ones.'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_eyes', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_mouth',
    {
        description: 'Add a mouth to the monster. Requires create_body to have been called first. ' +
            'Set tiltWithBody:true to automatically inherit the body\'s current angle instead of matching degrees by hand.',
        inputSchema: withModifiers(z.object({
            style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
            tiltWithBody: z.boolean().default(false)
                .describe('If true, mouth angle = body angle + any explicit angle given (as an offset).'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_mouth', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_antennas',
    {
        description: 'Add one or more antennas to the monster, evenly spaced. Requires create_body to have been called first. ' +
            'Supports optional visual modifiers: tint (multiplicative hex color — darkens more than it repaints, see the tint parameter), ' +
            'scale/scaleX/scaleY (size), angle (rotation), dx/dy (shifts the whole antenna row).',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
            size: z.enum(['small', 'large']).describe('Antenna size'),
            count: z.number().int().min(1).max(6).default(2).describe('Number of antennas'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_antennas', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

const bodySpec = withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
    shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant'),
}));

const armSpec = withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Default arm color, dark=brown'),
    pose: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Default arm shape variant'),
    mirror: z.boolean().default(true).describe('If false, only the right arm is placed.'),
    colorLeft: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional(),
    colorRight: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional(),
    poseLeft: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
    poseRight: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
    tintLeft: z.string().optional().describe('Override left arm tint — multiplicative: darkens dark arm colors more than it repaints them.'),
    tintRight: z.string().optional().describe('Override right arm tint — multiplicative: darkens dark arm colors more than it repaints them.'),
    scaleLeft: z.coerce.number().optional(),
    scaleRight: z.coerce.number().optional(),
    angleLeft: z.coerce.number().optional(),
    angleRight: z.coerce.number().optional(),
    dxLeft: z.coerce.number().optional(),
    dxRight: z.coerce.number().optional(),
    dyLeft: z.coerce.number().optional(),
    dyRight: z.coerce.number().optional(),
}));

const legSpec = withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Default leg color, dark=brown'),
    pose: z.enum(['A', 'B', 'C']).describe('Default leg shape variant'),
    stance: z.enum(['low', 'normal', 'high']).default('normal'),
    mirror: z.boolean().default(true).describe('If false, only the right leg is placed.'),
    colorLeft: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional(),
    colorRight: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).optional(),
    poseLeft: z.enum(['A', 'B', 'C']).optional(),
    poseRight: z.enum(['A', 'B', 'C']).optional(),
    tintLeft: z.string().optional().describe('Override left leg tint — multiplicative: darkens dark leg colors more than it repaints them.'),
    tintRight: z.string().optional().describe('Override right leg tint — multiplicative: darkens dark leg colors more than it repaints them.'),
    scaleLeft: z.coerce.number().optional(),
    scaleRight: z.coerce.number().optional(),
    angleLeft: z.coerce.number().optional(),
    angleRight: z.coerce.number().optional(),
    dxLeft: z.coerce.number().optional(),
    dxRight: z.coerce.number().optional(),
    dyLeft: z.coerce.number().optional(),
    dyRight: z.coerce.number().optional(),
}));

const eyeSpec = withModifiers(z.object({
    style: z.enum(eyeStyles).describe('Default eye style, some include a color (e.g. angry_blue), others do not (e.g. dead, human)'),
    count: z.number().int().min(1).max(6).default(2).describe('Number of eyes, e.g. 1 for a cyclops'),
    dominant: z.boolean().default(false),
    positions: z.array(eyePositionOverride).optional(),
}));

const mouthSpec = withModifiers(z.object({
    style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
    tiltWithBody: z.boolean().default(false),
}));

const antennaSpec = withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
    size: z.enum(['small', 'large']).describe('Antenna size'),
    count: z.number().int().min(1).max(6).default(2).describe('Number of antennas'),
}));

server.registerTool(
    'build_monster',
    {
        description: 'Build a complete monster in one call from a full specification. Only body is required; any other part can be omitted. ' +
            'Each part (body, arms, legs, eyes, mouth, antennas) accepts its own optional visual modifiers, and arms/legs/eyes support the same ' +
            'asymmetry/positions/stance overrides as their standalone tools.',
        inputSchema: z.object({
            body: bodySpec,
            arms: armSpec.optional(),
            legs: legSpec.optional(),
            eyes: eyeSpec.optional(),
            mouth: mouthSpec.optional(),
            antennas: antennaSpec.optional(),
        }),
    },
    async (params) => {
        try {
            const reply = await sendToGame('build_monster', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'describe_monster_colors',
    {
        description: 'Report the actual computed color of every part currently on the monster: base color, tint (if any), ' +
            'the effective color the multiplicative tint actually produces, its luminance (0-255 brightness), and the ' +
            'luminance difference from the body (contrast). Use this instead of reasoning about tint hex strings directly — ' +
            'ground truth from code, judgment from you.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('describe_monster_colors');
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

const GALLERY_DIR = 'gallery';

function slugifySeries(series) {
    return series.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// scan the series' own folder for the highest existing shot number every time.
function nextShotNumber(seriesDir) {
    let files;
    try {
        files = fs.readdirSync(seriesDir);
    } catch (e) {
        if (e.code === 'ENOENT') return 1; // first shot for this series
        throw e;
    }
    const numbers = files
        .map((f) => f.match(/^(\d+)\.png$/))
        .filter(Boolean)
        .map((m) => parseInt(m[1], 10));
    return (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
}

server.registerTool(
    'take_screenshot',
    {
        description: 'Capture an image of the current monster and save it into its series\' gallery folder, alongside a JSON ' +
            'sidecar of the exact monster state — so the shot is reproducible later. Use this after building to evaluate the design.',
        inputSchema: z.object({
            series: z.string().describe(
                'The style/series this monster belongs to, e.g. "rust-bucket". ' +
                'Use the same name as your memory style tag.'),
        }),
    },
    async ({ series }) => {
        try {
            const reply = await sendToGame('take_screenshot');
            const b64 = reply.result;

            const slug = slugifySeries(series);
            const seriesDir = `${GALLERY_DIR}/${slug}`;
            fs.mkdirSync(seriesDir, { recursive: true });

            const num = String(nextShotNumber(seriesDir)).padStart(3, '0');
            const pngPath = `${seriesDir}/${num}.png`;
            const jsonPath = `${seriesDir}/${num}.json`;

            fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));

            let stateText = '{}';
            try {
                const stateReply = await sendToGame('get_monster_state');
                stateText = stateReply.result;
            } catch (e) {
                stateText = JSON.stringify({ error: `Could not capture state: ${e.message}` });
            }
            fs.writeFileSync(jsonPath, stateText);

            return {
                content: [
                    { type: 'image', data: b64, mimeType: 'image/png' },
                    { type: 'text', text: `Saved ${pngPath}` },
                ],
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

function loadNotes() {
    try {
        const data = fs.readFileSync(NOTES_PATH, 'utf-8');
        if (!data.trim()) return [];
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
    }
}

server.registerTool(
    'remember',
    {
        description:
            'Store a design lesson you have learned, so future design sessions can benefit from it. ' +
            'Lessons should be specific and actionable, e.g. "tints below #444444 make parts hard to ' +
            'distinguish against the dark background", not vague, e.g. "use good colors".',
        inputSchema: z.object({
            lesson: z.string().describe('The design lesson to store'),
        }),
    },
    async ({ lesson }) => {
        const notes = loadNotes();
        notes.push({
            timestamp: new Date().toISOString(),
            lesson: lesson,
        });
        fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));

        console.error(`[memory] stored lesson #${notes.length}`);
        return {
            content: [{ type: 'text', text: `Lesson stored. You now have ${notes.length} lessons.` }],
        };
    }
);

server.registerTool(
    'recall',
    {
        description: 'Retrieve all design lessons stored so far from previous sessions. ' +
            'Call this at the start of a design task to apply what you have already learned before designing anything.',
        inputSchema: z.object({}),
    },
    async () => {
        const notes = loadNotes();
        if (notes.length === 0) {
            return { content: [{ type: 'text', text: 'No lessons stored yet.' }] };
        }
        const text = notes
            .map((n, i) => `${i + 1}. [${n.timestamp}] ${n.lesson}`)
            .join('\n');
        return { content: [{ type: 'text', text }] };
    }
);

// -- Start the server on stdio
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP server running — waiting for connections.');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});