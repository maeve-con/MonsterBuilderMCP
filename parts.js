// Attachment offsets are relative to the body center, in pixels.
// These are starting points — students are expected to tune them.
const PARTS = {
    body:   {
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        shapes: ['A', 'B', 'C', 'D', 'E', 'F'],
        // texture key pattern: body_{color}{shape}
        offset: { x: 0,   y: 0 }
    },
    arm:     { 
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        shapes: ['A', 'B', 'C', 'D', 'E'],
        // arm_{color}{A|B|C|D|E}
        offset: { x: 90,  y: 45  } 
    },  
    leg:     {
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        shapes: ['A', 'B', 'C'],
        // leg_{color}{A|B|C}
        offset: { x: 45,  y: 140 }
    },
    eye: {
    styles: [
        'angry_blue', 'angry_green', 'angry_red',
        'blue', 'red', 'yellow',
        'closed_feminine', 'closed_happy',
        'cute_dark', 'cute_light',
        'dead',
        'human_blue', 'human_green', 'human_red', 'human',
        'psycho_dark', 'psycho_light',
    ],
    // eye_{style}
    offset: { x: 0, y: -30 }, spacing: 40, maxRowWidth: 140
},
    mouth:   {
        styles: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
        // mouth{A..J}
        offset: { x: 0,   y: 30  }
    },
    antenna: {
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        sizes: ['small', 'large'],
        // detail_{color}_antenna_{small|large}
        offset: { x: 0,   y: -145 }, spacing: 50
    },
};
const CENTER_X = 400;
const CENTER_Y = 300;

const PART_BASE_COLORS = {
    blue:   '#43d7e5',
    green:  '#2ecc71',
    red:    '#ff4362',
    yellow: '#ffb600',
    dark:   '#4f3f2f',
};

function effectiveColor(baseHex, tintHex) {
    const b = parseInt(baseHex.slice(1), 16);
    const t = parseInt(tintHex.slice(1), 16);
    const ch = (shift) =>
        Math.round(((b >> shift & 0xff) * (t >> shift & 0xff)) / 255);
    return '#' + [16, 8, 0]
        .map(s => ch(s).toString(16).padStart(2, '0')).join('');
}

function luminance(hex) {
    const v = parseInt(hex.slice(1), 16);
    return Math.round(0.2126 * (v >> 16 & 255)
                    + 0.7152 * (v >> 8 & 255)
                    + 0.0722 * (v & 255));
}