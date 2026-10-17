const mycol = Object.freeze({
  white: '#FFFFFF',
  brown: '#251c19',
  pink: '#ebb7cf',
  green: '#5a713e',
  orange: '#d9603f',
  blue: '#387fc1',
  yellow: '#eabe40',
});

window.mycol = mycol;

Object.entries(mycol).forEach(([name, value]) => {
  document.documentElement.style.setProperty(`--mycol-${name}`, value);
});
