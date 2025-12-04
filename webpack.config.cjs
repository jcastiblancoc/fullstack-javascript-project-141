const path = require('path');

module.exports = {
  entry: path.resolve(__dirname, 'src', 'frontend', 'index.js'),
  output: {
    path: path.resolve(__dirname, 'public', 'dist'),
    filename: 'bundle.js',
    publicPath: '/public/dist/',
  },
  mode: 'production',
  module: {
    rules: [],
  },
};
