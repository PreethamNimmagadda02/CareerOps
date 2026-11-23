// The careerops theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in careerops.settings.json and the generated careerops.settings.ts;
// change them with `astryx experimental theme editor set careerops ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {careeropsSettings} from './careerops.settings';

export const careeropsTheme = defineTheme({
  extends: careeropsSettings,
  name: 'careerops',
});
