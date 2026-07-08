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
        offset: { x: 90,  y: 10  } 
    },  
    leg:     {
        colors: ['blue', 'green', 'red', 'yellow', 'dark'],
        shapes: ['A', 'B', 'C'],
        // leg_{color}{A|B|C}
        offset: { x: 45,  y: 100 }
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
    offset: { x: 0, y: -30 }, spacing: 40
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
        offset: { x: 0,   y: -95 }, spacing: 50
    },
};
const CENTER_X = 400;
const CENTER_Y = 300;