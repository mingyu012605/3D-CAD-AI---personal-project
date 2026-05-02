import { state } from './state.js';

export function addMessageToLog(sender, message) {
    const aiLog = document.getElementById('aiLog');
    if (!aiLog) return;
    const messageElement = document.createElement('p');
    messageElement.classList.add(sender === 'User' ? 'user-message' : sender === 'AI' ? 'ai-response' : 'system-message');
    messageElement.textContent = `${sender}: ${message}`;
    aiLog.appendChild(messageElement);
    aiLog.scrollTop = aiLog.scrollHeight; // Auto-scroll to bottom
}

// Private helpers for indexScene (not exported)
function getObjectColorHex(obj) {
    if (!obj.material) return '#cccccc';

    if (Array.isArray(obj.material)) {
        // Use first material's color
        const mat = obj.material[0];
        return mat && mat.color ? '#' + mat.color.getHexString() : '#cccccc';
    } else {
        return obj.material.color ? '#' + obj.material.color.getHexString() : '#cccccc';
    }
}

function getObjectSize(obj) {
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z);
}

function getPositionHint(position) {
    const x = position.x;
    const z = position.z;

    let hint = '';

    // Left/Right (X axis)
    if (x < -1) hint += 'left';
    else if (x > 1) hint += 'right';
    else hint += 'center';

    // Front/Back (Z axis)
    if (z < -1) hint += '-back';
    else if (z > 1) hint += '-front';
    else if (hint !== 'center') hint += '-center';

    return hint;
}

function getSizeHint(size) {
    if (size < 1) return 'small';
    else if (size < 3) return 'medium';
    else return 'large';
}

// private constant for findObjectsByClass
const OBJECT_SYNONYMS = {
    car: ["car", "vehicle", "van", "truck", "bus", "automobile", "auto"],
    ball: ["ball", "sphere", "orb"],
    cone: ["cone", "pyramid"],
    cube: ["cube", "box", "block"],
    cylinder: ["cylinder", "tube", "pipe"],
    plane: ["plane", "floor", "ground", "platform"],
    torus: ["torus", "donut", "ring"]
};

export function indexScene(scene) {
    const index = [];

    state.loadedModels.forEach(obj => {
        if (!obj || !obj.uuid) return;

        // Extract object information
        const info = {
            uuid: obj.uuid,
            name: obj.name || 'Unnamed Object',
            tags: obj.userData?.tags || [],
            color: getObjectColorHex(obj),
            position: obj.position.clone(),
            size: getObjectSize(obj),
            positionHint: getPositionHint(obj.position),
            sizeHint: getSizeHint(getObjectSize(obj))
        };

        index.push(info);
    });

    return index;
}

export function findObjectsByClass(index, className) {
    const synonyms = OBJECT_SYNONYMS[className.toLowerCase()] || [className.toLowerCase()];

    return index.filter(obj => {
        const name = obj.name.toLowerCase();
        const tags = obj.tags.map(tag => tag.toLowerCase());

        return synonyms.some(synonym =>
            name.includes(synonym) ||
            tags.includes(synonym) ||
            name === synonym
        );
    });
}

export function makeTextSprite(message, parameters) {
    if (parameters === undefined) parameters = {};
    const fontface = parameters.fontface || 'Arial';
    const fontsize = parameters.fontsize || 40;
    const borderThickness = 0; // Removed border
    const borderColor = parameters.borderColor || { r: 0, g: 0, b: 0, a: 0.0 }; // Transparent border
    const backgroundColor = parameters.backgroundColor || { r: 255, g: 255, b: 255, a: 0.0 }; // Transparent background
    const textColor = parameters.textColor || { r: 0, g: 0, b: 0, a: 1.0 };

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = "Bold " + fontsize + "px " + fontface;
    const metrics = context.measureText(message);
    const textWidth = metrics.width;

    // Adjust canvas size to fit text
    canvas.width = textWidth + borderThickness * 2;
    canvas.height = fontsize + borderThickness * 2;

    context.font = "Bold " + fontsize + "px " + fontface;
    context.textBaseline = "middle"; // Center vertically
    context.textAlign = "center";   // Center horizontally

    // background color (if not transparent)
    if (backgroundColor.a > 0) {
        context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
        context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.fillStyle = "rgba(" + textColor.r + ", " + textColor.g + ", " + textColor.b + ", " + textColor.a + ")";
    context.fillText(message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.userData.isGridLabel = true; // Mark as grid label for easy removal
    return sprite;
}
