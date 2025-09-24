import 'express-async-errors';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import routes from './routes';
import { errorHandler } from './utils/errorHandler';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/iiitnr', routes);

// central error handler
app.use(errorHandler);

export default app;