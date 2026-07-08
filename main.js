const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d44',
    scene: [MonsterScene],
};

new Phaser.Game(config);