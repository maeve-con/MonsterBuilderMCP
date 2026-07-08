class MonsterScene extends Phaser.Scene {
    constructor() {
        super('MonsterScene');
        this.commandQueue = [];
        this.monster = {};       // holds references to current parts
        this.ws = null;
        this.connected = false;
    }

    preload() {
        // Body
        for (const color of PARTS.body.colors) {
            for (const shape of PARTS.body.shapes) {
                const key = `body_${color}${shape}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }
        // Arms
        for (const color of PARTS.arm.colors) {
            for (const shape of PARTS.arm.shapes) {
                const key = `arm_${color}${shape}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }
        // Legs
        for (const color of PARTS.leg.colors) {
            for (const shape of PARTS.leg.shapes) {
                const key = `leg_${color}${shape}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }
        // Eyes (no color component)
        for (const style of PARTS.eye.styles) {
            const key = `eye_${style}`;
            this.load.image(key, `assets/${key}.png`);
        }
        // Mouth (no underscore, no color)
        for (const style of PARTS.mouth.styles) {
            const key = `mouth${style}`;
            this.load.image(key, `assets/${key}.png`);
        }
        // Antennas
        for (const color of PARTS.antenna.colors) {
            for (const size of PARTS.antenna.sizes) {
                const key = `detail_${color}_antenna_${size}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }
    }

    create() {
        this.statusText = this.add.text(10, 10, 'waiting for bridge connection...',
            { color: '#888', fontSize: '14px' });
        this.connectToBridge();
    }

    connectToBridge() {
        this.ws = new WebSocket('ws://localhost:8081');

        this.ws.onopen = () => {
            this.connected = true;
            this.statusText.setText('bridge connected');
            this.statusText.setColor('#6f6');
        };

        // IMPORTANT: this handler never touches game objects.
        // It only enqueues. update() applies changes on Phaser's schedule.
        this.ws.onmessage = (event) => {
            this.commandQueue.push(JSON.parse(event.data));
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.statusText.setText('bridge disconnected — retrying...');
            this.statusText.setColor('#f66');
            setTimeout(() => this.connectToBridge(), 1000);
        };
        this.ws.onerror = () => { /* onclose fires next; retry happens there */ };
    }

    update() {
        // Handle tool requests coming from the MCP server
        while (this.commandQueue.length > 0) {
            const msg = this.commandQueue.shift();
            let result;
            try {
                result = this.executeCommand(msg.command, msg.params);
            } catch (err) {
                result = `Error executing ${msg.command}: ${err.message}`;
            }
            this.ws.send(JSON.stringify({ id: msg.id, result }));
        }
    }

    clearMonster() {
        for (const part of Object.values(this.monster).flat()) {
            if (part && part.destroy) part.destroy();
        }
        this.monster = {};
    }

    // ============================================================
    // TODO: implement this. Each case applies one command and
    // returns a string describing what happened (or an error).
    // ============================================================
    executeCommand(command, params) {
        switch (command) {
            case 'clear_monster':
                this.clearMonster();
                return 'Monster cleared.';

            case 'create_body': {
                this.clearMonster();  // provided in starter code
                const key = `body_${params.color}${params.shape}`;
                this.monster.body = this.add.image(CENTER_X, CENTER_Y, key);
                return `Created a ${params.color} type-${params.shape} body.`;
            }
            case 'add_arms': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `arm_${params.color}${params.pose}`;
                const off = PARTS.arm.offset;  // from the manifest

                const rightArm = this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key);
                const leftArm  = this.add.image(CENTER_X - off.x, CENTER_Y + off.y, key)
                    .setFlipX(true);

                this.monster.arms = [leftArm, rightArm];
                return `Added a mirrored pair of ${params.color} arms.`;
            }
            case 'add_legs': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `leg_${params.color}${params.pose}`;
                const off = PARTS.leg.offset;  // from the manifest

                const rightLeg = this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key);
                const leftLeg  = this.add.image(CENTER_X - off.x, CENTER_Y + off.y, key)
                    .setFlipX(true);

                this.monster.legs = [leftLeg, rightLeg];
                return `Added a mirrored pair of ${params.color} legs.`;
            }
            case 'add_eyes': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `eye_${params.style}`;
                const off = PARTS.eye.offset;
                const spacing = PARTS.eye.spacing;
                const count = params.count || 2;

                const eyes = [];
                for (let i = 0; i < count; i++) {
                    const x = CENTER_X + (i - (count - 1) / 2) * spacing;
                    eyes.push(this.add.image(x, CENTER_Y + off.y, key));
                }

                this.monster.eyes = eyes;
                return `Added ${count} style-${params.style} eye${count === 1 ? '' : 's'}.`;
            }
            case 'add_mouth': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `mouth${params.style}`;
                const off = PARTS.mouth.offset;

                const mouth = this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key);

                this.monster.mouth = mouth;
                return `Added a style-${params.style} mouth.`;
            }
            case 'add_antennas': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `detail_${params.color}_antenna_${params.size}`;
                const off = PARTS.antenna.offset;
                const spacing = PARTS.antenna.spacing;
                const count = params.count || 2;

                const antennas = [];
                for (let i = 0; i < count; i++) {
                    const x = CENTER_X + (i - (count - 1) / 2) * spacing;
                    antennas.push(this.add.image(x, CENTER_Y + off.y, key));
                }

                this.monster.antennas = antennas;
                return `Added ${count} ${params.color} ${params.size} antenna${count === 1 ? '' : 's'}.`;
            }
            case 'get_monster_state': {
                const state = {};

                if (this.monster.body) {
                    state.body = this.monster.body.texture.key;
                }
                if (this.monster.mouth) {
                    state.mouth = this.monster.mouth.texture.key;
                }
                for (const partName of ['arms', 'legs', 'eyes', 'antennas']) {
                    if (this.monster[partName]) {
                        state[partName] = this.monster[partName].map(p => p.texture.key);
                    }
                }

                return JSON.stringify(state);
            }
            case 'build_monster': {
                if (!params.body) {
                    return 'Error: build_monster requires a body specification.';
                }

                const commandMap = {
                    arms: 'add_arms',
                    legs: 'add_legs',
                    eyes: 'add_eyes',
                    mouth: 'add_mouth',
                    antennas: 'add_antennas'
                };

                // create_body clears any existing monster, same as calling it directly
                const messages = [this.executeCommand('create_body', params.body)];

                for (const partName of ['arms', 'legs', 'eyes', 'mouth', 'antennas']) {
                    if (params[partName]) {
                        messages.push(this.executeCommand(commandMap[partName], params[partName]));
                    }
                }

                return `Built monster:\n${messages.join('\n')}`;
            }

            default:
                return `Unknown command: ${command}`;
        }
    }
}