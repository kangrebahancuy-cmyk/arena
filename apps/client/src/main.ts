import './ui/styles.css';
import { startApp } from './app/startApp';
import { readClientConfig } from './config/clientConfig';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('index.html is missing the #app root element');
}

startApp(root, readClientConfig());
