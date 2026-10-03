// The project's palette, in one place.
//
// Every colour used by every generated asset comes from here, which is what keeps the prototype
// looking like one world instead of four unrelated drawings. Colours are hand-picked (no source
// image, no third-party palette): a muted, slightly desaturated style that reads well on both light
// and dark screens and stays comfortable at 16x16.
export const PALETTE = {
  outline: [26, 22, 32, 255],

  grassBase: [86, 130, 62, 255],
  grassDark: [70, 110, 50, 255],
  grassDarker: [58, 96, 44, 255],
  grassLight: [106, 152, 76, 255],

  flowerWhite: [242, 240, 226, 255],
  flowerYellow: [232, 206, 92, 255],

  dirtBase: [138, 106, 71, 255],
  dirtDark: [112, 84, 55, 255],
  dirtLight: [160, 128, 90, 255],
  pebble: [96, 72, 48, 255],

  waterDeep: [38, 88, 142, 255],
  waterMid: [54, 114, 172, 255],
  waterLight: [96, 156, 206, 255],
  waterEdge: [28, 66, 112, 255],

  stoneBase: [122, 122, 132, 255],
  stoneLight: [152, 152, 162, 255],
  stoneDark: [94, 94, 104, 255],
  stoneMortar: [76, 76, 86, 255],

  trunk: [98, 70, 44, 255],
  trunkDark: [74, 52, 34, 255],
  leafDark: [46, 84, 44, 255],
  leafMid: [58, 104, 52, 255],
  leafLight: [76, 128, 64, 255],
  pineDark: [40, 78, 52, 255],
  pineMid: [52, 96, 62, 255],
  pineLight: [68, 118, 74, 255],
  berry: [188, 76, 76, 255],
  rockBase: [128, 128, 136, 255],
  rockLight: [158, 158, 166, 255],
  rockDark: [90, 90, 100, 255],

  skinPlayer: [232, 186, 140, 255],
  skinVillager: [222, 172, 126, 255],
  hairPlayer: [58, 42, 30, 255],
  hairVillager: [120, 90, 48, 255],
  shirtPlayer: [79, 127, 214, 255],
  shirtPlayerDark: [56, 96, 172, 255],
  shirtVillager: [176, 86, 63, 255],
  shirtVillagerDark: [138, 62, 45, 255],
  pantsPlayer: [47, 58, 86, 255],
  pantsVillager: [90, 74, 53, 255],
  boots: [42, 35, 28, 255],
  hatVillager: [216, 180, 92, 255],
  hatVillagerDark: [174, 140, 68, 255],

  // Unexplored-world cloud (the prototype's fog). Opaque on purpose: the point of fog is that you
  // cannot see through it, and translucency would make the culling cost of the hidden layer visible.
  cloudBase: [214, 216, 224, 255],
  cloudMid: [188, 192, 206, 255],
  cloudShade: [158, 163, 182, 255],
  cloudLight: [236, 238, 244, 255],

  dust: [226, 216, 194, 255],
  shadow: [22, 20, 28, 96],
};
