---
name: ghibli-character-animator
description: Expert skill for creating Studio Ghibli-styled animal characters, whimsical classroom environments, and animated storyboards for kids. Synthesizes principles from cognitive schemas (user mental models), Gestalt visual perception, character archetype mapping, and the 7-component prompt framework. Enforces mandatory automated visual retrieval and self-evaluation of generated assets before presentation.
---

# Ghibli Character Animator & World-Building Skill

This skill governs the end-to-end design, JSON scripting, prompt synthesis, and empirical visual evaluation of animal characters and backgrounds rendered in the **Studio Ghibli aesthetic** (Hayao Miyazaki / Isao Takahata style) tailored for children's animation.

---

## 1. Core Theoretical Foundations (NotebookLM Insights)

### 1.1. Cognitive Schemas & Intuitive Metaphors (Jakob Nielsen Heuristics #2 & #4)
- **Leverage Existing Schemas**: Children understand the world through established mental models. When designing animal characters, anchor them to intuitive behavioral metaphors:
  - *Rabbit*: Fast, hyper-reactive, dramatic, easily startled.
  - *Panda*: Relaxed, slow, chubby, cozy sleeper.
  - *Fox (Fennec)*: Cunning, high-energy, mischievous prankster.
  - *Penguin*: Wobbly, clumsy, earnest, comically flustered.
  - *Hamster*: Greedy hoarder, joyful glutton, cheeks full of treats.
  - *Golden Puppy*: Boundless enthusiasm, eager student, unconditional joy.
- **Metaphorical Consistency**: Accessories and props must reinforce these archetypes (e.g., oversized glasses for the anxious rabbit, paper airplane for the sly fox, acorn hat for the sleepy panda).

### 1.2. Gestalt Visual Perception & Shape Language
- **Shape Psychology**:
  - **Circles / Soft Curves (O)**: Innocent, friendly, huggable, harmless (dominant in Ghibli baby animals).
  - **Triangles / Diagonals (Δ)**: Dynamic, mischievous, alert, high velocity (ears, whiskers, tilted caps).
  - **Rounded Squares (▢)**: Sturdy, grounded, ponderous, reliable.
- **Silhouette Primacy**: Every character must have a completely unmistakable silhouette. A child should identify the character immediately from its black-and-white outline.
- **Aesthetic & Minimalist Design (Nielsen Heuristic #8)**: Avoid visual clutter. Every detail must serve a storytelling or emotional purpose; keep the face uncluttered to maximize readable emotion.

### 1.3. The 12 Principles of Animation: Organic Facial Acting & Exaggeration
- **Exaggeration through Organic Anatomy (NO Baked-in Decals/VFX)**: For children and downstream 3D/animation pipelines, emotions must be amplified ("lố") strictly through anatomical and facial acting, NOT through external comic stickers or VFX decals:
  - *Surprise/Shock*: Eyes popping wide with dilated/contracted pupils, dramatic arched eyebrows, comically dropped O-shaped jaw, soft pale or flushed cheeks. **STRICTLY NO giant sweat drops, water droplets, teardrops, or shockwave stickers baked onto the skin/forehead**.
  - *Sleepiness*: Heavy drooping eyelids, cheeks comically squished/melting like warm mochi against shoulders, tilted sleepy head, gentle parted lips. **STRICTLY NO expanding snot bubbles or floating 'Zzz' puffs baked onto character textures**.
  - *Mischief*: Wide ear-to-ear grin showing a tiny cute snaggletooth, crescent-moon eye crinkles, angled playful eyebrows, rosy flushed cheeks. **NO floating sparkle stars or sweat marks**.
- **The Decal/VFX Quarantine Rule**: Transient emotional VFX (sweat drops, tears, steam, action lines) belong exclusively to downstream animation compositing or post-FX. Baking them directly into character asset textures permanently ruins 3D meshing, character turnarounds, and multi-angle consistency. Keep base character textures 100% clean and organic.

---

## 2. Studio Ghibli Art Direction Specifications

### 2.1. Visual Aesthetic Checklist
- **Traditional Hand-Drawn Cel Animation Feel**: Fine, clean, warm graphite/ink line art outlines. No hyper-glossy or plastic 3D textures.
- **Gouache & Watercolor Backgrounds**: Hand-painted textures, lush vegetation, vintage polished wood grains, painterly clouds, and soft atmospheric perspective.
- **Natural, Warm Color Palettes**: Earth tones, sunny yellows, grassy greens, warm terracotta, soft creams, and gentle pastel accents.
- **Volumetric Golden-Hour & Morning Lighting**: Soft sunbeams streaming through arched wooden windows, warm rim highlights, gentle ambient shadows.
- **Soulful & Expressive Eyes**: Clean, hand-drawn eyes with distinct circular highlights and emotive eyebrows.

---

## 3. The 7-Component Prompt Framework

When generating prompts for image synthesis (e.g. Nano Banana Pro, Midjourney, Imagen), adhere to this strict structure:

1. **Asset Type**: Isolated character on clean background OR panoramic background scene.
2. **Subject Anatomy**: Specific animal species, baby proportions, rounded head-to-body ratio (1:1.5 or 1:2 chibi scale).
3. **Pose & Rigging Stance**: Standard T-pose / T-bone rigging stance (both arms outstretched horizontally straight sideways perpendicular to torso, standing upright on both feet, ready for 3D skeleton rigging and animation), captured from standard 3/4 isometric perspective.
4. **Exaggerated Expression**: Specific facial distortion (eyes, mouth, cheeks, ears) matching the emotional archetype.
5. **Attire & Props**: Distinctive, vintage, hand-crafted kindergarten/school clothing with tactile textures.
6. **Visual Style & Art Direction**: Explicitly specifying `Studio Ghibli hand-drawn 2D animation style by Hayao Miyazaki, gouache painting, cel shaded, vintage anime aesthetic, soft watercolor textures, clean crisp ink outlines`.
7. **Lighting & Atmosphere**: Morning sunbeams, dust motes, warm nostalgic daylight.

---

## 4. Google Flow JSON Schemas

### 4.1. Character Studio JSON (`Asset Studio -> Character Hub`)
*Generates isolated character turnaround assets in standardized T-bone / T-pose rigging stance from 3/4 isometric view with expressive anatomical facial acting only. Strictly excludes baked-in emotional VFX decals (no sweat drops, no tears, no snot bubbles, no comic symbols).*
```json
{
  "subject": "An adorable baby [SPECIES] student, Studio Ghibli 2D hand-drawn animation style",
  "pose_and_perspective": "T-bone rigging stance (T-pose) with both arms outstretched horizontally straight sideways perpendicular to torso, standing upright on both feet, 3/4 isometric perspective view, ready for 3D skeleton rigging",
  "facial_expression": "comically exaggerated [EMOTION] expression conveyed purely through anatomical features: [EYES POSE/PUPIL DILATION], [EYEBROWS ANGLE], [MOUTH SHAPE/DROPPED JAW], delicate soft cheek blush, clean ink line art, soft cel shading, completely clean forehead and face without any sweat drops, water droplets, tears, snot bubbles, or comic sticker decals",
  "attire": "[OUTFIT WITH VINTAGE TEXTURES], [DISTINCTIVE ACCESSORY], [CHARACTER PROP]",
  "art_style": "Studio Ghibli 2D hand-drawn animation style, Hayao Miyazaki aesthetic, gouache painted texture, warm watercolor tones, isolated on transparent-friendly solid light gray background, full body character turnaround shot, no floating comic symbols, no VFX overlays"
}
```

### 4.2. Background Studio JSON (`Asset Studio -> Background Hub`)
*Focuses strictly on pure architectural space, empty room shell, walls, arched windows, atmospheric lighting, and clean floors without loose clutter or movable furniture.*
```json
{
  "environment": "A nostalgic whimsical kindergarten classroom shell, Studio Ghibli aesthetic, golden morning sunlight streaming through arched wooden frame windows",
  "lighting": "warm morning sunlight, glowing dust motes in sunbeams, painterly soft shadows, peaceful nostalgic Ghibli atmosphere",
  "architecture": "clean empty wooden floorboards, rustic plaster walls, exposed timber beams, empty arched window alcove, clean uncluttered room shell, open staging space for prop placement",
  "art_style": "Studio Ghibli hand-painted gouache background art, Kazuo Oga scenery style, rich watercolor textures, wide-angle cinematic establishing shot, no characters, no loose furniture, no props"
}
```

### 4.3. Prop & Furniture Studio JSON (`Asset Studio -> Prop Hub`)
*Dedicated generation of isolated furniture, stationery, and tactile classroom objects with matching hand-drawn Ghibli textures, rendered on transparent/neutral background for seamless modular compositing.*
```json
{
  "prop_name": "Rustic wooden student desk with pencil groove and matching chair",
  "category": "furniture",
  "material_and_texture": "hand-crafted warm grain oak wood, rounded corners, soft gouache painted texture, gentle hand-inked outlines, subtle vintage scuffs",
  "scale_and_perspective": "child-scale chibi proportions, isometric 3/4 view matching classroom perspective",
  "art_style": "Studio Ghibli 2D hand-drawn animation prop style, Hayao Miyazaki aesthetic, warm natural earth tones, isolated on transparent-friendly solid white background, no characters, no room"
}
```

### 4.4. Vietnamese Cultural Props & Water Terrain JSON (`Prop Hub & Terrain Hub`)
*Dedicated schemas for Vietnamese traditional items (thuyền thúng, nón lá, nội thất mộc) and countryside water environments (ao cá, hầm cá tra Miền Tây, sông).*
```json
{
  "prop_or_terrain_name": "Vietnamese Woven Bamboo Coracle Boat / Catfish Pond Tile",
  "category": "vietnamese_cultural_prop | water_terrain_tile",
  "cultural_elements": "hand-woven bamboo slats, rustic timber planks, duckweed, water lilies, floating water hyacinths, bamboo bridge stakes",
  "scale_and_perspective": "isometric 3/4 perspective, clean planar cutaway for terrain or isolated prop stance",
  "art_style": "70% Studio Ghibli hand-painted gouache watercolor texture, 30% clean low-poly facets, warm sunny morning lighting, isolated on solid light gray background, no characters"
}
```

---

## 5. Mandatory Automated Visual Self-Evaluation Protocol

When an agent operates in this skill:
1. **Never assert that an image is good without physically inspecting it.**
2. **Download or extract the image base64** directly from the tool/browser to a local path in the workspace (e.g., `/home/tak/openclaw/assets/...`).
3. **Call `view_file` on the image path** to visually inspect the actual rendered output.
4. **Score the asset against the 5 Ghibli Criteria**:
   - [ ] **Ghibli Authenticity**: Does it look like hand-drawn 2D cel animation / gouache instead of generic plastic 3D CGI?
   - [ ] **Expression Exaggeration ("Lố")**: Is the expression vivid, funny, and engaging for kids without being scary?
   - [ ] **Silhouette & Proportions**: Are proportions cute, rounded, and easily recognizable?
   - [ ] **Palette & Lighting**: Is the color scheme warm, nostalgic, and harmonious?
   - [ ] **Cleanliness**: Is the character cleanly isolated from the background?
5. If an asset fails any criterion, refine the prompt and regenerate immediately until it satisfies all standards.

---

## 6. The 70% Ghibli + 30% Low-Poly 3D Hybrid Style Directive

When the art direction calls for **70% Ghibli + 30% Low-Poly 3D**:
- **The 30% Low-Poly Geometry**:
  - Defined geometric planar facets and angular polygonal bevels on character silhouette (ears, body, clothing folds, limbs).
  - Subtle faceted shading giving a tactile, papercraft-meets-indie-3D game feel (similar to *A Short Hike*, *Lil Gator Game*, *Breath of the Wild* cell-shaded poly).
  - Clean faceted silhouette that prevents hyper-smooth realism or plastic CGI look.
- **The 70% Ghibli Hand-Painted Soul**:
  - Hand-painted gouache / watercolor textures seamlessly mapped onto each polygonal facet.
  - Warm, nostalgic Miyazaki color palette (moss green, terracotta, sunny yellow, warm cream).
  - Expressive 2D anime facial features (circular anime eyes, delicate pink blush, ink outlines) painted directly onto the faceted geometry.
  - Exaggerated comedic facial acting (wide shocked eyes, tiny startled pupils, dropped O-mouth, comical frowns or grins) rendered with hand-drawn charm.
  - **Negative Constraint (Crucial for 3D/Animation)**: NO baked-in sweat drops, NO teardrops, NO snot bubbles, NO floating action lines or symbols. Keep the faceted character skin/fur 100% clean so 3D mesh generation does not bake 2D decals into geometry.
- **Prompt Formula**:
  `"Stylized 3D low-poly character with Studio Ghibli aesthetic, 70% Ghibli hand-painted gouache watercolor texture, 30% clean low-poly geometric facets, papercraft origami feel with warm Miyazaki cel-shading, fine ink contours on polygonal edges, comical exaggerated expression conveyed purely through wide eyes and dropped mouth, clean face with no sweat drops, no teardrops, no stickers, charming indie game model"`

---

## 7. Rigging-Ready T-Pose Quality Standards & Golden Rules

Assets generated for 3D modeling and Unity integration must satisfy these 5 Golden Quality Gates:

1. **Horizontal Arm Alignment**:
   - Both arms must be outstretched at precisely 180° perpendicular to the spine.
   - Hands must have palms facing slightly downward or forward with clear finger separation or mitten block.
   - Distinct underarm clearance from torso (minimum 15% body width gap) to prevent mesh fusion during auto-weighting.
2. **Ground Plane Stance & Feet Stability**:
   - Feet planted flat on horizontal ground plane ($y=0$), shoulder-width apart.
   - No leg crossing, knee bending, or dynamic tilt; weight evenly distributed.
3. **Camera Perspective Synchronization**:
   - Fixed at 3/4 isometric perspective ($\approx 30^\circ$ pitch, $45^\circ$ yaw) to provide 3D depth cues while retaining symmetrical rigging proportions.
4. **Organic Facial Acting (Clean Skin Doctrine)**:
   - Facial emotion conveyed exclusively through eyes, brows, and mouth.
   - Zero transient anime decals (no sweat droplets, tears, or snot) baked into the base texture.
5. **Color & Lighting Consistency**:
   - Warm golden morning daylight with ambient fill.
   - Flat, solid light neutral gray background ($RGB \approx [220, 220, 220]$) for automated background removal.

---

## 8. 3D Game Terrain & Modular Environment Platform Specifications

When generating terrain or ground tiles for characters to stand on in Unity 3D:

1. **Modular Diorama Platform Concept**:
   - Generate ground as a floating island or diorama chunk with a distinct vertical cutaway (cross-section showing soil/rock layers).
   - This creates clear geometric boundaries for Unity colliders and level design tiles.
2. **Flat Walkable Top Surface (Physics & NavMesh Ready)**:
   - The top surface must be mostly horizontal with gentle slope variations so character feet align naturally without clipping or floating.
   - Texture: lush low-poly faceted green grass with hand-painted gouache watercolor strokes, rustic cobblestone stepping paths, and subtle earth patches.
3. **Style & Perspective Parity**:
   - Same 70% Ghibli Gouache + 30% Low-Poly hybrid aesthetic as characters.
   - Same 3/4 isometric camera angle to ensure seamless visual matching when composited together in Unity scenes.
4. **Isolated Asset Quarantine**:
   - Never render characters or movable props baked directly onto the terrain tile. Terrain must remain an empty modular stage asset.
5. **Terrain Prompt Formula**:
   `"Stylized 3D low-poly diorama terrain platform for a Ghibli video game, floating island ground chunk, 70% Studio Ghibli hand-painted gouache watercolor texture, 30% clean low-poly geometric facets, flat walkable top surface with lush warm green grass and rustic cobblestone path, vertical cutaway cross-section showing earthy rock and soil layers, warm sunny morning lighting, 3/4 isometric perspective, isolated on solid light neutral gray background, no characters, modular game environment tile"`
6. **Courtyard-Connected 2.5D Environments ("Sân Nối Khu Vực" & Hidden Grid)**:
   - **Hidden Grid Doctrine**: Visual wireframes and grid borders must be 100% hidden. Ground blending between lush grass and sandy earth courtyards must be smooth and organic. The underlying grid is strictly an invisible backend construct for NavMesh and colliders.
   - **Courtyard Connectivity**: Open warm-toned sandy plazas ("sân đất nện") weave through forest corridors and connect lower ground to elevated tiered plateaus via stone steps, serving as visual gameplay pathfinding guides.
   - **Tiered Elevation**: Vertical cliff ledges with cast shadows create natural navigation layers (Tier 1 -> Tier 2) requiring dedicated ramps or stairs to traverse.


