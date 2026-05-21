import type { FC } from 'react';
import type { PdfTemplateProps } from './types';
import DefaultInvoiceTemplate from './default';
import Grey1Template from './grey-1';
import Orange1Template from './orange-1';
import Blue1Template from './blue-1';
import Orange2Template from './orange-2';
import BlueGrey1Template from './blue-grey-1';
import PinkBerryTemplate from './pink-berry';
import GreenProTemplate from './green-pro';
import GreenEleganceTemplate from './green-elegance';
import BrownBlackTemplate from './brown-black';
import BlueSimpleTemplate from './blue-simple';

// Registry of React-PDF invoice templates, keyed by `InvoiceTemplate.templateKey`.
// All 10 design slots are now wired to real templates — `DefaultInvoiceTemplate`
// remains imported as the fallback returned by `getTemplateComponent` when an
// unknown `templateKey` is requested.
export const PDF_TEMPLATE_REGISTRY: Record<string, FC<PdfTemplateProps>> = {
  'design-1': Grey1Template,
  'design-2': Orange1Template,
  'design-3': Blue1Template,
  'design-4': Orange2Template,
  'design-5': BlueGrey1Template,
  'design-6': PinkBerryTemplate,
  'design-7': GreenProTemplate,
  'design-8': GreenEleganceTemplate,
  'design-9': BrownBlackTemplate,
  'design-10': BlueSimpleTemplate,
};

export function getTemplateComponent(templateKey: string | null | undefined): FC<PdfTemplateProps> {
  if (!templateKey) return DefaultInvoiceTemplate;
  return PDF_TEMPLATE_REGISTRY[templateKey] ?? DefaultInvoiceTemplate;
}
