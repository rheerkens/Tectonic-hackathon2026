import primary from '../../../../docs/branding/assets/primary.svg';
import reverse from '../../../../docs/branding/assets/reverse.svg';

export function Brand() {
  return (
    <picture className="brand">
      <source media="(prefers-color-scheme: dark)" srcSet={reverse} />
      <img src={primary} alt="SDtrust" width="1154" height="335" />
    </picture>
  );
}
