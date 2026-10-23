# MR Software – krav og acceptkriterier for ny forside
Dato: 23. oktober 2026

## Formål
Positionér MR Software som en softwarevirksomhed med dokumenterbare forretningsresultater, uden at fremstille prognoser som dokumenterede besparelser. Forsiden skal fungere for ledelse, drift og tekniske beslutningstagere.

## Funktionelle krav og acceptkriterier
- KR-01 Positionering: Hero forklarer software, workflows og målbar effekt. **AC:** Budskabet kan forstås uden forkundskab til Sassy eller Workslip, og første CTA fører til løsninger.
- KR-02 Løsninger: Workslip og FoodTrading fremvises separat. **AC:** Workslip er markeret 'I drift'; FoodTrading 'Under udvikling · demo'; begge har links og konkret procesbeskrivelse.
- KR-03 Resultater: Aggregater vises kun med kilde- og fortolkningsforbehold. **AC:** 3 min. aktiv udfyldelsestid og 4,6 dages forløb omtales ikke som besparelse; ingen opdigtet ROI, kundecitat eller baseline.
- KR-04 Metode: Forklar forstå → byg → automatisér → mål. **AC:** Alle fire led vises læsbart på både desktop og mobil.
- KR-05 Teknik: Teknisk troværdighed uden at dominere forsiden. **AC:** Links til eksisterende sikkerheds-, validerings- og driftssider forbliver tilgængelige.
- KR-06 Kontakt: Besøgende kan starte dialog. **AC:** E-mail-CTA har korrekt mailto-adresse og emne.
- KR-07 Navigation: Tastatur og mobil understøttes. **AC:** Menu kan åbnes/lukkes på smal skærm med opdateret aria-expanded, Escape-lukning og link-lukning.
- KR-08 Responsive design: Design fungerer ved 320, 375, 390, 768, 1024 og 1440 CSS-pixels. **AC:** Intet vandret scroll, ingen overlap eller afskåret CTA, og touch-targets mindst ca. 44 px.
- KR-09 Metadata: SEO-tekst matcher den nye positionering. **AC:** Dansk sidetitel, beskrivelse, viewport, korrekt heading-hierarki og skip-link.
- KR-10 Eksisterende sider: Genbrug fælles styling uden regression. **AC:** Undersider og links til sikkerhed, roadmap, driftsstatus og privatliv bevares.
- KR-11 Priser: Ingen uverificerede priser på forsiden. **AC:** Prisafvigelse mellem webshop og prisside afklares særskilt, før priser markedsføres.
- KR-12 Privatliv: Ingen person- eller kundehenførbare driftsmålinger offentliggøres. **AC:** Markedsføringsdata gennemgår datagodkendelse, før release.

## Release-gates
1. HTML-struktur og lokale interne links kontrolleret.
2. JavaScript syntakskontrol og menuflow.
3. CSS/responsivt layout undersøgt ved ovenstående viewports.
4. Tilgængelighed: keyboard, fokus, kontrast og reduced motion.
5. Factual review af samtlige virksomheds- og resultatpåstande.
6. Automatiske CI-checks og deploy-preview er grønne, hvis konfigureret.
7. Pull request til menneskelig review; ingen automatisk merge.

**Bemærk:** Krav er definitionen af færdig. Ikke alle gates kan bekræftes alene ved et kodecommit; de kræver testkørsel og eventuel godkendelse.