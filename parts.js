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
    // TODO: need to add colors and shapes (or alternate) to the below 
    leg:     { offset: { x: 45,  y: 100 } },   // leg_{color}{A|B|C}
    eye:     { offset: { x: 0,   y: -30 }, spacing: 40 },  // eye_{style}
    mouth:   { offset: { x: 0,   y: 30  } },   // mouth{A..J}
    antenna: { offset: { x: 0,   y: -95 }, spacing: 50 },  // detail_{color}_antenna_{small|large}
};
const CENTER_X = 400;
const CENTER_Y = 300;