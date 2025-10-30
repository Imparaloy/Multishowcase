// Canonical tag taxonomy used by Explore/Groups
export const CATEGORY_MAP = {
  '2d-art': '2D art',
  '3d-model': '3D model',
  'graphic-design': 'Graphic Design',
  'animation': 'Animation',
  'game': 'Game',
  'ux-ui': 'UX/UI design'
};

export const TAG_LIST = [
  { slug: 'all', label: 'All' },
  ...Object.entries(CATEGORY_MAP).map(([slug, label]) => ({ slug, label }))
];

export default TAG_LIST;
