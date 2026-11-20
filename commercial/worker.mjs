import { createApplication } from './server/application.mjs';
import { wrapCommercialApplication } from './server/assets.mjs';

export default wrapCommercialApplication(createApplication());
