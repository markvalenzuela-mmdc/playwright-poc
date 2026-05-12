import type { Page, Locator } from '@playwright/test';

export type LocatorContract =
  | {
      kind: 'role';
      role:
        | 'link'
        | 'button'
        | 'heading'
        | 'textbox'
        | 'combobox'
        | 'checkbox'
        | 'radio'
        | 'option'
        | 'form';
      name?: string | RegExp;
      exact?: boolean;
    }
  | {
      kind: 'text';
      text: string | RegExp;
      exact?: boolean;
    }
  | {
      kind: 'css';
      selector: string;
    };

export type CriticalPathContract = {
  path: string;
  expectedTitlePattern?: RegExp;
  expectedUrlPattern?: RegExp;
};

export type PageElementContract = {
  path: string;
  requiredLocators: LocatorContract[];
  forbiddenTextPatterns?: RegExp[];
};

export type CtaExpectation =
  | {
      mode: 'urlRegex';
      urlRegex: RegExp;
    }
  | {
      mode: 'samePageState';
      stableLocator: LocatorContract;
    };

export type PrimaryCtaContract = {
  path: string;
  locator: LocatorContract;
  expect: CtaExpectation;
  allowPopup: boolean;
};

export type FormFieldContract = {
  name: string;
  locator: LocatorContract;
  value: string;
  optional?: boolean;
};

export type ValidationExpectation =
  | {
      type: 'atLeastOneRequiredField';
    }
  | {
      type: 'requiredFieldInvalidWhenBlank';
      field: LocatorContract;
    }
  | {
      type: 'noNavigationDuringFill';
    };

export type FormContract = {
  path: string;
  formLocator: LocatorContract;
  required: boolean;
  fields: FormFieldContract[];
  validationExpectations: ValidationExpectation[];
  submitMode: 'no-submit';
};

export function resolveLocator(page: Page | Locator, contract: LocatorContract): Locator {
  if (contract.kind === 'css') {
    return page.locator(contract.selector);
  }

  if (contract.kind === 'text') {
    return page.getByText(contract.text, { exact: contract.exact });
  }

  return page.getByRole(contract.role, {
    name: contract.name,
    exact: contract.exact,
  });
}

const PROGRAM_AND_CERTIFICATION_PATHS = [
  '/certification-programs/',
  '/college-programs/',
  '/college-programs/ba-ai/',
  '/college-programs/marketing-management/',
  '/college-programs/operations-management/',
  '/college-programs/hr-management/',
  '/college-programs/it-ai/',
  '/college-programs/data-analytics/',
  '/college-programs/software-development/',
  '/college-programs/network-and-cybersecurity/',
  '/certification-programs/content-creator/',
  '/certification-programs/ai/',
  '/certification-programs/esl-instructor/',
  '/certification-programs/digital-marketing/',
  '/certification-programs/data-analytics/',
  '/certification-programs/ielts-preparation/',
  '/certification-programs/virtual-assistance/',
] as const;

const ADMISSIONS_PATHS = [
  '/admissions/',
  '/admissions/asenso/',
  '/admissions/abanse-negrense-scholarship/',
  '/admissions/city-scholarships/',
  '/admissions/continuing-education/',
  '/admissions/gadget-scholarship/',
  '/admissions/next-gen/',
  '/admissions/family-discount/',
  '/admissions/ygc-ayala-discount/',
  '/admissions/financial-wellness-checker/',
] as const;

const FINANCE_PATHS = ['/study-now-pay-later/', '/bukas/'] as const;

const DEFAULT_REQUIRED_LOCATORS: LocatorContract[] = [
  { kind: 'css', selector: 'main' },
  { kind: 'role', role: 'heading' },
];

export const PAGE_ELEMENT_CONTRACTS: PageElementContract[] = [
  {
    path: '/',
    requiredLocators: [
      { kind: 'role', role: 'heading', name: /MMDC|Map[uú]a|Malayan/i },
      { kind: 'role', role: 'link', name: /Admissions?|Programs?/i },
    ],
    forbiddenTextPatterns: [/404/i, /Page not found/i],
  },
  ...PROGRAM_AND_CERTIFICATION_PATHS.map((path) => ({
    path,
    requiredLocators: DEFAULT_REQUIRED_LOCATORS,
    forbiddenTextPatterns: [/404/i, /Page not found/i],
  })),
  ...ADMISSIONS_PATHS.map((path) => ({
    path,
    requiredLocators: [
      { kind: 'role', role: 'heading' },
      { kind: 'role', role: 'link', name: /Apply|Admissions?|Enroll|Scholarship/i },
    ],
    forbiddenTextPatterns: [/404/i, /Page not found/i],
  })),
  ...FINANCE_PATHS.map((path) => ({
    path,
    requiredLocators: [
      { kind: 'role', role: 'heading' },
      { kind: 'role', role: 'link', name: /Apply|Start|Admissions?|Study/i },
    ],
    forbiddenTextPatterns: [/404/i, /Page not found/i],
  })),
];

const DEFAULT_PRIMARY_CTA_LOCATOR: LocatorContract = {
  kind: 'role',
  role: 'link',
  name: /Apply|Enroll|Admissions?|Programs?|Study|Start/i,
};

const CTA_EXPECTATION: CtaExpectation = {
  mode: 'urlRegex',
  urlRegex: /(mmdc\.mcl\.edu\.ph|bukas\.ph)/i,
};

export const PRIMARY_CTA_CONTRACTS: PrimaryCtaContract[] = [
  '/',
  ...PROGRAM_AND_CERTIFICATION_PATHS,
  ...ADMISSIONS_PATHS,
  ...FINANCE_PATHS,
].map((path) => ({
  path,
  locator: DEFAULT_PRIMARY_CTA_LOCATOR,
  expect:
    path === '/study-now-pay-later/'
      ? {
          mode: 'urlRegex',
          // This page may route to partner or financing flows outside MMDC.
          urlRegex: /^https?:\/\/.+/i,
        }
      : CTA_EXPECTATION,
  allowPopup: true,
}));

export const FORM_CONTRACTS: FormContract[] = [
  {
    path: '/admissions/',
    formLocator: { kind: 'css', selector: 'form' },
    required: false,
    fields: [
      {
        name: 'fullName',
        locator: { kind: 'css', selector: 'input[name*="name" i], input[placeholder*="name" i]' },
        value: 'Playwright Monitor',
      },
      {
        name: 'email',
        locator: { kind: 'css', selector: 'input[type="email"], input[name*="email" i]' },
        value: 'monitor@example.com',
      },
      {
        name: 'phone',
        locator: { kind: 'css', selector: 'input[type="tel"], input[name*="phone" i]' },
        value: '09171234567',
        optional: true,
      },
    ],
    validationExpectations: [
      { type: 'atLeastOneRequiredField' },
      {
        type: 'requiredFieldInvalidWhenBlank',
        field: { kind: 'css', selector: 'input[required], textarea[required]' },
      },
      { type: 'noNavigationDuringFill' },
    ],
    submitMode: 'no-submit',
  },
  {
    path: '/study-now-pay-later/',
    formLocator: { kind: 'css', selector: 'form' },
    required: false,
    fields: [
      {
        name: 'fullName',
        locator: { kind: 'css', selector: 'input[name*="name" i], input[placeholder*="name" i]' },
        value: 'Payment Test User',
      },
      {
        name: 'email',
        locator: { kind: 'css', selector: 'input[type="email"], input[name*="email" i]' },
        value: 'payments@example.com',
      },
    ],
    validationExpectations: [
      { type: 'atLeastOneRequiredField' },
      { type: 'noNavigationDuringFill' },
    ],
    submitMode: 'no-submit',
  },
  {
    path: '/bukas/',
    formLocator: { kind: 'css', selector: 'form' },
    required: false,
    fields: [
      {
        name: 'fullName',
        locator: { kind: 'css', selector: 'input[name*="name" i], input[placeholder*="name" i]' },
        value: 'Bukas Test User',
      },
      {
        name: 'email',
        locator: { kind: 'css', selector: 'input[type="email"], input[name*="email" i]' },
        value: 'bukas@example.com',
      },
    ],
    validationExpectations: [
      { type: 'atLeastOneRequiredField' },
      { type: 'noNavigationDuringFill' },
    ],
    submitMode: 'no-submit',
  },
  {
    path: '/admissions/financial-wellness-checker/',
    formLocator: { kind: 'css', selector: 'form' },
    required: false,
    fields: [
      {
        name: 'email',
        locator: { kind: 'css', selector: 'input[type="email"], input[name*="email" i]' },
        value: 'wellness@example.com',
      },
      {
        name: 'phone',
        locator: { kind: 'css', selector: 'input[type="tel"], input[name*="phone" i]' },
        value: '09170000000',
        optional: true,
      },
    ],
    validationExpectations: [
      { type: 'atLeastOneRequiredField' },
      { type: 'noNavigationDuringFill' },
    ],
    submitMode: 'no-submit',
  },
];
