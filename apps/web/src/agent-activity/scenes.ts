/** Original Microsoft screenshots. All rectangles use source-image pixel coordinates. */
export interface ReadingTarget { rect: [number, number, number, number]; label: string }
export interface SceneDef {
  id: string; app: string; status: string; image: string; size: [number, number];
  crop?: [number, number, number, number]; source: string; asset: string; targets: ReadingTarget[];
}
export const LOOP_MS = 12_000;
export const SCENES: SceneDef[] = [
  {
    id: 'teams', app: 'Microsoft Teams', status: 'Teamchats doorzoeken',
    image: '/agent-sources/teams.png', size: [5888, 3368],
    source: 'https://techcommunity.microsoft.com/blog/microsoftteamsblog/introducing-the-new-microsoft-teams-chat-and-channels-experience/4275674',
    asset: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/images/bS00Mjc1Njc0LTYzMzI1NmlEMUM2NkMyNjNGMDc4QjAy?revision=19',
    targets: [
      { rect: [1910, 923, 2710, 150], label: 'Gesprek lezen' },
      { rect: [1910, 1077, 1400, 150], label: 'Planning bekijken' },
      { rect: [2480, 1686, 3040, 146], label: 'Verwijzing naar de backlog volgen' },
      { rect: [1910, 2348, 1505, 155], label: 'Gedeeld document herkennen' },
    ],
  },
  {
    id: 'outlook', app: 'Microsoft Outlook', status: 'Mailbox doorzoeken',
    image: '/agent-sources/outlook.png', size: [1431, 856], crop: [58, 29, 1315, 740],
    source: 'https://techcommunity.microsoft.com/blog/outlook/built-for-today-designed-for-the-future---the-new-outlook-for-windows-is-ready-w/4205635',
    asset: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/images/bS00MjA1NjM1LTYwNDkyNGk1RTg1RjQxRDI5NjE0OTc3?revision=22',
    targets: [
      { rect: [328, 191, 320, 52], label: 'Conversaties bekijken' },
      { rect: [328, 278, 320, 70], label: 'Bericht van Lydia Bauer lezen' },
      { rect: [729, 273, 306, 51], label: 'Verwijzing naar OneDrive herkennen' },
      { rect: [692, 488, 351, 70], label: 'Vervolgbericht bekijken' },
    ],
  },
  {
    id: 'sharepoint', app: 'Microsoft SharePoint', status: 'Documenten doorzoeken',
    image: '/agent-sources/sharepoint.png', size: [1389, 943],
    source: 'https://techcommunity.microsoft.com/blog/spblog/ux-updates-ai-actions--forms-in-document-libraries/4466700',
    asset: 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/images/bS00NDY2NzAwLUlOWXZ3Ng?revision=9',
    targets: [
      { rect: [352, 326, 725, 104], label: 'Document en samenvatting lezen' },
      { rect: [352, 433, 725, 104], label: 'PDF in de bibliotheek bekijken' },
      { rect: [352, 647, 725, 104], label: 'Contractdocument bekijken' },
      { rect: [352, 755, 725, 103], label: 'Publicatiestatus controleren' },
    ],
  },
  {
    id: 'handbook', app: 'Microsoft Edge · PDF', status: 'Handboek lezen',
    image: '/agent-sources/handbook.png', size: [1202, 568],
    source: 'https://learn.microsoft.com/en-us/deployedge/microsoft-edge-pdf',
    asset: 'https://learn.microsoft.com/en-us/deployedge/media/microsoft-edge-pdf/pdf-reader-highlight.png',
    targets: [
      { rect: [304, 134, 242, 68], label: 'Eerste paragraaf lezen' },
      { rect: [304, 216, 242, 47], label: 'Aanpak bekijken' },
      { rect: [304, 349, 242, 57], label: 'Volgende sectie lezen' },
      { rect: [304, 419, 242, 65], label: 'Beleidsinstellingen bekijken' },
    ],
  },
  {
    id: 'experts', app: 'Microsoft Teams · Organisatie', status: 'Expertise vinden',
    image: '/agent-sources/experts.png', size: [1248, 1677], crop: [24, 12, 1200, 950],
    source: 'https://mc.merill.net/message/MC1151242',
    asset: 'https://cxcs.microsoft.net/static/public/messagecenter/neutral/ba1a3d3a-2e6c-45b4-8071-bfd8c0ca1fb2/e90e6f504ff5ae3e3707db5583773bcac01123b7.png',
    targets: [
      { rect: [238, 48, 594, 91], label: 'Profiel en functie bekijken' },
      { rect: [325, 403, 597, 123], label: 'Organisatiestructuur volgen' },
      { rect: [325, 553, 597, 123], label: 'Team en vakgebied bekijken' },
      { rect: [325, 703, 597, 164], label: 'Expertprofiel lezen' },
    ],
  },
  {
    id: 'access', app: 'SharePoint · Manage Access', status: 'Toegang controleren',
    image: '/agent-sources/access.png', size: [435, 509],
    source: 'https://support.microsoft.com/en-us/sharepoint/sharepoint-sharing-and-permissions/see-who-a-file-is-shared-with-in-onedrive-or-sharepoint',
    asset: 'https://support.microsoft.com/en-us/sharepoint/media/file-shared-004.png',
    targets: [
      { rect: [25, 180, 389, 42], label: 'Bewerkrechten bekijken' },
      { rect: [25, 234, 389, 42], label: 'Volgende persoon controleren' },
      { rect: [25, 289, 389, 42], label: 'Alleen-lezenrechten herkennen' },
      { rect: [25, 344, 389, 42], label: 'Toegangsrechten vergelijken' },
    ],
  },
];
export const SCENE_IDS = SCENES.map((s) => s.id);
