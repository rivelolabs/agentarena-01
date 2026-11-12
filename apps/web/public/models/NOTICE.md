# Character models and animations

The fighter models (`volt.glb`, `titan.glb`, `nyx.glb`, `pyra.glb`, `aegis.glb`, `glitch.glb`, `kaiju.glb`, `oracle.glb`)
and the animation library (`anims.glb`) come from **Adobe Mixamo** (https://www.mixamo.com), downloaded with the
project owner's Adobe account and converted to glTF.

| File | Mixamo character |
|---|---|
| volt.glb | Exo Gray |
| titan.glb | Vanguard by T. Choonyung |
| nyx.glb | Ninja |
| pyra.glb | Kachujin G Rosales |
| aegis.glb | Paladin J Nordstrom |
| glitch.glb | X Bot |
| kaiju.glb | Mutant |
| oracle.glb | Ely by K. Atienza |
| warrok.glb | Maria J J Ong (fighter VESPA; the file keeps the old slug) |
| noctis.glb | Vampire A Lusth |
| akai.glb | Akai E Espiritu |
| people/pete.glb | Pete (Realm townsfolk: builders) |
| people/suzie.glb | Suzie (Realm townsfolk: visitors) |

Animations: Fighting Idle, Punching, Roundhouse Kick, Standing 1H Cast Spell 01, Flying Bicycle Kick, Right Block,
Standing Dodge Right, Taunt, Hit Reaction, Big Stomach Hit, Dizzy Idle, Knocked Unconscious, Victory Idle, Standard Walk, Death,
Hurricane Kick, Flying Knee Punch Combo, Mma Kick, Uppercut, Hook Punch, Illegal Elbow Punch, Headbutt, Jump, Backflip,
Front Flip, Stabbing, Martelo 2, Leg Sweep, Kip Up, Flair, Flying Back Death, Sweep Fall, Receiving A Big Uppercut, Fireball,
Drop Kick, Falling Back Death, Getting Up, Standing Taunt Battlecry, Flip Kick, Jab Cross, Body Jab Cross, Knee Kick Lead,
Side Kick, Inside Crescent Kick, Armada, Butterfly Twirl, Cartwheel, Sprinting Forward Roll, Standing 2H Magic Attack 01,
Standing Melee Attack Downward, Mutant Roaring, Cross Punch, Mutant Swiping, Head Hit, Kidney Hit, Shoved Reaction With Spin,
Falling Forward Death, Dying Backwards, Standing Taunt Chest Thump, Fist Pump, Hip Hop Dancing, Quick Formal Bow, Center Block,
Being Electrocuted, Standing Dodge Left, Spin Flip Kick, Meia Lua De Compasso, Bouncing Fight Idle, Ginga Forward,
Ginga Backward, Short Step Forward, Step Backward, Injured Stumble Idle, Taunt Gesture, Ducking, Dodging Back, Esquiva 1,
Body Block, Outward Block, Stumble Backwards, Stomach Hit, Quad Punch, Bencao, Jump Attack, Mutant Jump Attack,
Knocked Out (exported on X Bot, merged into anims.glb,
meshopt-compressed).

Mixamo assets may be used in your own products under Adobe's terms, but they are **not** open-source and must not be
redistributed on their own. Check Adobe's current Mixamo terms before launch, and do not publish this folder in a
public repository (the MIT licence of `contracts/` does not cover these files).

To swap a fighter, replace its `.glb` with any character that uses the Mixamo skeleton (bones named `mixamorig:*`).

# Arena backgrounds

`apps/web/public/hdri/*.hdr` are 360° photographs from **Poly Haven** (https://polyhaven.com), licensed CC0 (free for any use,
no attribution required): Empty Warehouse 01, Venice Sunset, Potsdamer Platz. They are the 1k versions; download the 4k
versions from Poly Haven and keep the same file names for a sharper background.
