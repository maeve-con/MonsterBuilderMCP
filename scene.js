const STANCE_DY = { low: 25, normal: 0, high: -20 };

// --- Color reporting helpers (1b/1c) ---
// Uses PART_BASE_COLORS / effectiveColor / luminance from parts.js.

function describeLuminance(l) {
    if (l < 60) return 'very dark';
    if (l < 110) return 'dark';
    if (l < 170) return 'medium';
    if (l < 220) return 'bright';
    return 'very bright';
}

// Short suffix for an add_* reply string, e.g.
// " (base dark, tint #cd853f, effective \u2248 #271f17 \u2014 very dark)"
// Returns '' when there's no tint or the color name isn't in PART_BASE_COLORS
// (e.g. eye styles, mouth styles — those aren't plain color names).
function tintNote(colorName, tintHex) {
    if (!tintHex || !colorName || !PART_BASE_COLORS[colorName]) return '';
    const base = PART_BASE_COLORS[colorName];
    const eff = effectiveColor(base, tintHex);
    return ` (base ${colorName}, tint ${tintHex}, effective \u2248 ${eff} \u2014 ${describeLuminance(luminance(eff))})`;
}

// Stashes the color name + tint that produced a part, so describe_monster_colors
// can reconstruct the report later without re-deriving it from texture keys.
function tagColor(obj, colorName, tintHex) {
    if (obj) obj.monsterColorMeta = { colorName: colorName || null, tint: tintHex || null };
    return obj;
}

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
        while (this.commandQueue.length > 0) {
            const msg = this.commandQueue.shift();
            let result;
            try {
                result = this.executeCommand(msg.command, msg.params);
            } catch (err) {
                result = `Error executing ${msg.command}: ${err.message}`;
            }

            if (result instanceof Promise) {
                result
                    .then((res) => this.ws.send(JSON.stringify({ id: msg.id, result: res })))
                    .catch((err) => this.ws.send(JSON.stringify({
                        id: msg.id,
                        result: `Error executing ${msg.command}: ${err.message}`,
                    })));
            } else {
                this.ws.send(JSON.stringify({ id: msg.id, result }));
            }
        }
    }

    clearMonster() {
        for (const part of Object.values(this.monster).flat()) {
            if (part && part.destroy) part.destroy();
        }
        this.monster = {};
    }

    applyModifiers(obj, params) {
        if (!obj || !params) return;
        if (params.tint !== undefined) {
            obj.setTint(parseInt(params.tint.slice(1), 16));
        }
        if (params.scaleX !== undefined || params.scaleY !== undefined) {
            obj.setScale(
                params.scaleX !== undefined ? params.scaleX : obj.scaleX,
                params.scaleY !== undefined ? params.scaleY : obj.scaleY
            );
        } else if (params.scale !== undefined) {
            obj.setScale(params.scale);
        }
        if (params.angle !== undefined) {
            obj.setAngle(params.angle);
        }
    }

    executeCommand(command, params) {
        switch (command) {
            case 'clear_monster':
                this.clearMonster();
                return 'Monster cleared.';

            case 'create_body': {
                this.clearMonster();
                const key = `body_${params.color}${params.shape}`;
                const x = CENTER_X + (params.dx || 0);
                const y = CENTER_Y + (params.dy || 0);

                const body = this.add.image(x, y, key);
                this.applyModifiers(body, params);
                tagColor(body, params.color, params.tint);

                this.monster.body = body;
                return `Created a ${params.color} type-${params.shape} body.${tintNote(params.color, params.tint)}`;
            }

            case 'add_arms': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const off = PARTS.arm.offset;

                const rightP = {
                    color: params.colorRight || params.color,
                    pose: params.poseRight || params.pose,
                    tint: params.tintRight || params.tint,
                    scale: params.scaleRight !== undefined ? params.scaleRight : params.scale,
                    scaleX: params.scaleX, scaleY: params.scaleY,
                    angle: params.angleRight !== undefined ? params.angleRight : params.angle,
                    dx: params.dxRight || 0,
                    dy: params.dyRight || 0,
                };
                const rightKey = `arm_${rightP.color}${rightP.pose}`;
                const rightArm = this.add.image(CENTER_X + off.x + rightP.dx, CENTER_Y + off.y + rightP.dy, rightKey);
                this.applyModifiers(rightArm, rightP);
                tagColor(rightArm, rightP.color, rightP.tint);

                let leftArm = null;
                let leftP = null;
                if (params.mirror !== false) {
                    leftP = {
                        color: params.colorLeft || params.color,
                        pose: params.poseLeft || params.pose,
                        tint: params.tintLeft || params.tint,
                        scale: params.scaleLeft !== undefined ? params.scaleLeft : params.scale,
                        scaleX: params.scaleX, scaleY: params.scaleY,
                        angle: params.angleLeft !== undefined ? params.angleLeft : params.angle,
                        dx: params.dxLeft || 0,
                        dy: params.dyLeft || 0,
                    };
                    const leftKey = `arm_${leftP.color}${leftP.pose}`;
                    leftArm = this.add.image(CENTER_X - off.x + leftP.dx, CENTER_Y + off.y + leftP.dy, leftKey)
                        .setFlipX(true);
                    this.applyModifiers(leftArm, leftP);
                    tagColor(leftArm, leftP.color, leftP.tint);
                }

                this.monster.arms = leftArm ? [leftArm, rightArm] : [rightArm];
                return leftArm
                    ? `Added arms: right=${rightP.color}${rightP.pose}${tintNote(rightP.color, rightP.tint)}, ` +
                      `left=${leftP.color}${leftP.pose}${tintNote(leftP.color, leftP.tint)}.`
                    : `Added a single right arm: ${rightP.color}${rightP.pose} (mirror off).${tintNote(rightP.color, rightP.tint)}`;
            }

            case 'add_legs': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const off = PARTS.leg.offset;
                const stanceDy = STANCE_DY[params.stance || 'normal'];

                const rightP = {
                    color: params.colorRight || params.color,
                    pose: params.poseRight || params.pose,
                    tint: params.tintRight || params.tint,
                    scale: params.scaleRight !== undefined ? params.scaleRight : params.scale,
                    scaleX: params.scaleX, scaleY: params.scaleY,
                    angle: params.angleRight !== undefined ? params.angleRight : params.angle,
                    dx: params.dxRight || 0,
                    dy: (params.dyRight || 0) + stanceDy,
                };
                const rightKey = `leg_${rightP.color}${rightP.pose}`;
                const rightLeg = this.add.image(CENTER_X + off.x + rightP.dx, CENTER_Y + off.y + rightP.dy, rightKey);
                this.applyModifiers(rightLeg, rightP);
                tagColor(rightLeg, rightP.color, rightP.tint);

                let leftLeg = null;
                let leftP = null;
                if (params.mirror !== false) {
                    leftP = {
                        color: params.colorLeft || params.color,
                        pose: params.poseLeft || params.pose,
                        tint: params.tintLeft || params.tint,
                        scale: params.scaleLeft !== undefined ? params.scaleLeft : params.scale,
                        scaleX: params.scaleX, scaleY: params.scaleY,
                        angle: params.angleLeft !== undefined ? params.angleLeft : params.angle,
                        dx: params.dxLeft || 0,
                        dy: (params.dyLeft || 0) + stanceDy,
                    };
                    const leftKey = `leg_${leftP.color}${leftP.pose}`;
                    leftLeg = this.add.image(CENTER_X - off.x + leftP.dx, CENTER_Y + off.y + leftP.dy, leftKey)
                        .setFlipX(true);
                    this.applyModifiers(leftLeg, leftP);
                    tagColor(leftLeg, leftP.color, leftP.tint);
                }

                this.monster.legs = leftLeg ? [leftLeg, rightLeg] : [rightLeg];
                return leftLeg
                    ? `Added legs: right=${rightP.color}${rightP.pose}${tintNote(rightP.color, rightP.tint)}, ` +
                      `left=${leftP.color}${leftP.pose}${tintNote(leftP.color, leftP.tint)}, stance=${params.stance || 'normal'}.`
                    : `Added a single right leg: ${rightP.color}${rightP.pose} (mirror off).${tintNote(rightP.color, rightP.tint)}`;
            }

            case 'add_eyes': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const off = PARTS.eye.offset;
                const count = params.count || 2;
                const maxRowWidth = PARTS.eye.maxRowWidth || PARTS.eye.spacing * 3;
                const spacing = count > 1
                    ? Math.min(PARTS.eye.spacing, maxRowWidth / (count - 1))
                    : PARTS.eye.spacing;
                const baseDx = params.dx || 0;
                const baseDy = params.dy || 0;

                const eyes = [];
                for (let i = 0; i < count; i++) {
                    const pos = (params.positions && params.positions[i]) || {};
                    const style = pos.style || params.style;
                    const key = `eye_${style}`;
                    const x = CENTER_X + (i - (count - 1) / 2) * spacing + (pos.dx !== undefined ? pos.dx : baseDx);
                    const y = CENTER_Y + off.y + (pos.dy !== undefined ? pos.dy : baseDy);

                    let scale = pos.scale !== undefined ? pos.scale : params.scale;
                    if (params.dominant && i === 0 && scale === undefined) scale = 1.4;

                    const merged = {
                        tint: pos.tint || params.tint,
                        scale,
                        scaleX: params.scaleX, scaleY: params.scaleY,
                        angle: pos.angle !== undefined ? pos.angle : params.angle,
                    };

                    const eye = this.add.image(x, y, key);
                    this.applyModifiers(eye, merged);
                    // Eyes are style-based (e.g. "angry_blue"), not a plain color
                    // name, so there's no PART_BASE_COLORS entry to compute against —
                    // tag the tint anyway so describe_monster_colors can flag it.
                    tagColor(eye, null, merged.tint);
                    eyes.push(eye);
                }

                this.monster.eyes = eyes;
                return `Added ${count} eye${count === 1 ? '' : 's'}${params.positions ? ' with per-eye overrides' : ''}.`;
            }

            case 'add_mouth': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `mouth${params.style}`;
                const off = PARTS.mouth.offset;
                const dx = params.dx || 0;
                const dy = params.dy || 0;

                const mouth = this.add.image(CENTER_X + off.x + dx, CENTER_Y + off.y + dy, key);

                const mergedParams = { ...params };
                if (params.tiltWithBody && this.monster.body) {
                    mergedParams.angle = this.monster.body.angle + (params.angle || 0);
                }
                this.applyModifiers(mouth, mergedParams);

                this.monster.mouth = mouth;
                return `Added a style-${params.style} mouth${params.tiltWithBody ? ' (tilted with body)' : ''}.`;
            }

            case 'add_antennas': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                const key = `detail_${params.color}_antenna_${params.size}`;
                const off = PARTS.antenna.offset;
                const spacing = PARTS.antenna.spacing;
                const count = params.count || 2;
                const dx = params.dx || 0;
                const dy = params.dy || 0;

                const antennas = [];
                for (let i = 0; i < count; i++) {
                    const x = CENTER_X + (i - (count - 1) / 2) * spacing + dx;
                    const antenna = this.add.image(x, CENTER_Y + off.y + dy, key);
                    this.applyModifiers(antenna, params);
                    tagColor(antenna, params.color, params.tint);
                    antennas.push(antenna);
                }

                this.monster.antennas = antennas;
                return `Added ${count} ${params.color} ${params.size} antenna${count === 1 ? '' : 's'}.${tintNote(params.color, params.tint)}`;
            }

            case 'describe_monster_colors': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';

                const resolve = (meta) => {
                    if (!meta || !meta.colorName || !PART_BASE_COLORS[meta.colorName]) return null;
                    const eff = effectiveColor(PART_BASE_COLORS[meta.colorName], meta.tint || '#ffffff');
                    return { effective: eff, luminance: luminance(eff) };
                };

                const bodyMeta = this.monster.body.monsterColorMeta || {};
                const bodyResolved = resolve(bodyMeta);
                const bodyLum = bodyResolved ? bodyResolved.luminance : null;

                const report = [];
                const describeOne = (label, obj) => {
                    if (!obj) return;
                    const meta = obj.monsterColorMeta || {};
                    const resolved = resolve(meta);
                    report.push({
                        part: label,
                        base: meta.colorName || 'n/a (style-based part, no plain color name)',
                        tint: meta.tint || null,
                        effective: resolved ? resolved.effective : null,
                        luminance: resolved ? resolved.luminance : null,
                        luminanceDiffFromBody: (resolved && bodyLum !== null) ? resolved.luminance - bodyLum : null,
                    });
                };

                describeOne('body', this.monster.body);
                if (this.monster.arms) {
                    const labels = this.monster.arms.length === 2 ? ['arm.left', 'arm.right'] : ['arm.right'];
                    this.monster.arms.forEach((a, i) => describeOne(labels[i] || `arm.${i}`, a));
                }
                if (this.monster.legs) {
                    const labels = this.monster.legs.length === 2 ? ['leg.left', 'leg.right'] : ['leg.right'];
                    this.monster.legs.forEach((l, i) => describeOne(labels[i] || `leg.${i}`, l));
                }
                if (this.monster.antennas) {
                    this.monster.antennas.forEach((a, i) => describeOne(`antenna.${i}`, a));
                }
                if (this.monster.eyes) {
                    this.monster.eyes.forEach((e, i) => describeOne(`eye.${i}`, e));
                }

                return JSON.stringify(report, null, 2);
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

            case 'take_screenshot': {
                return new Promise((resolve) => {
                    this.game.renderer.snapshot((image) => {
                        resolve(image.src.split(',')[1]);
                    });
                });
            }

            default:
                return `Unknown command: ${command}`;
        }
    }
}