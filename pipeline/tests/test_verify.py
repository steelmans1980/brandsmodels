"""Regression checks for verification mistakes found in review. Run: python3 -m unittest discover pipeline/tests

Fixtures are short synthetic pages that reproduce the structure of the real page that went wrong.
"""
import unittest

from pipeline import discover, extract, seasons, verify

verify.KNOWN_BRANDS.update({'celine', 'givenchy', 'louis vuitton', 'tom ford', 'armani', 'aldo', 'valentino', 'carven'})
verify.KNOWN_MAGAZINES.update({"Harper's Bazaar"})


def group(brand, year, family=None, kind='campaign', models=(), title=None, aliases=()):
    return {'id': 'x', 'brand': brand, 'year': year, 'family': family, 'kind': kind, 'models': list(models),
            'title': title, 'aliases': list(aliases), 'season': None}


def article(title, text, url='https://example.com/story/', published=None, images=()):
    return {'title': title, 'text': text, 'url': url, 'published': published, 'images': list(images)}


class Seasons(unittest.TestCase):
    def test_foreign_season_words(self):
        # anneofcarversville: "Celine Hiver 2025 Campaign" was not read at all
        self.assertEqual(seasons.mentions('Celine Hiver 2025 Campaign')[0][:2], ('FW', 2025))
        self.assertEqual(seasons.mentions('Primavera/Estate 2016')[0][:2], ('SS', 2016))


class Periods(unittest.TestCase):
    celine = group('Celine', 2026, 'FW', models=['Alaina Rae', 'Faith Johnson'])
    body = ('Celine is out with their winter 2026 campaign today, the same day that Givenchy by Sarah Burton releases '
            'their new Fall 2026 Campaign. These new Celine Hiver 2026 campaign images feature models Alaina Rae and '
            'Faith Johnson.')

    def test_headline_conflict_resolved_by_publication_date(self):
        v = verify.assess(self.celine, article('Celine Hiver 2025 Campaign by Zoe Ghertner', self.body,
                                               published='2026-08-27T21:13:02-0400'))
        self.assertEqual(v['verdict'], 'exact')
        self.assertIn('resolved_by', v['evidence']['conflict'])

    def test_headline_conflict_unresolved_is_candidate(self):
        v = verify.assess(self.celine, article('Celine Hiver 2025 Campaign by Zoe Ghertner', self.body,
                                               published='2025-08-27T21:13:02-0400'))
        self.assertEqual(v['verdict'], 'candidate')

    def test_season_next_to_another_label_does_not_count(self):
        g = group('Celine', 2026, 'FW', models=['Alaina Rae'])
        text = ('Celine muse Alaina Rae was spotted in Paris on the same day that the house of Givenchy by Sarah Burton '
                'releases its new Fall 2026 campaign.')
        v = verify.assess(g, article('Celine news', text))
        self.assertNotEqual(v['verdict'], 'exact')

    def test_byline_date_is_not_the_campaign_year(self):
        # fashionista: "Mar 8, 2023 8:51 AM EST" was read as the campaign year
        g = group('Marc Jacobs', 2023, models=['Jessica Stam'])
        text = ('It really is the Stamaissance! Mar 8, 2023 8:51 AM EST Get Fashionista in your feed. Jessica Stam '
                'for Marc Jacobs’ Stam Bag campaign.')
        v = verify.assess(g, article('Marc Jacobs Is Bringing Back the Stam Bag', text))
        self.assertNotEqual(v['verdict'], 'exact')

    def test_event_date_in_a_sentence_still_counts(self):
        g = group('Fendi', 2021, kind='runway', models=['Kate Moss'])
        text = 'Kate Moss walking the Fendi runway show during Milan Fashion Week on September 26, 2021.'
        self.assertEqual(verify.assess(g, article('Fendi show', text))['verdict'], 'exact')

    def test_year_sentence_with_another_season(self):
        # khamsa: "debut in only 2020 at the Louis Vuitton FW21 show" accepted as the 2020 show
        g = group('Louis Vuitton', 2020, kind='runway', models=['Loli Bahia'])
        text = 'Making her runway debut in only 2020 at the Louis Vuitton FW21 show, Loli Bahia is a staple.'
        self.assertNotEqual(verify.assess(g, article('Models Watch: Loli Bahia', text))['verdict'], 'exact')

    def test_year_must_date_the_campaign(self):
        # wmagazine: "named a so-called Angel in 1997" accepted as the 1997 campaign
        g = group("Victoria's Secret", 1997, models=['Helena Christensen'])
        text = ("Victoria's Secret's new campaign was photographed by a woman; it also stars Helena Christensen. "
                "The now 51-year-old was named a so-called Angel in 1997, as was now 49-year-old Daniela Pestova, "
                "who’s also in the campaign.")
        self.assertNotEqual(verify.assess(g, article("Victoria's Secret's New Era", text))['verdict'], 'exact')

    def test_year_dating_the_campaign_still_counts(self):
        g = group('Armani', 1980, models=['Gia Carangi'])
        text = '1980 Campaign ~ Featuring Gia Carangi. Gia Carangi for the 1980 Giorgio Arman campaign. Photographer Aldo Fallai.'
        self.assertEqual(verify.assess(g, article('GIORGIO ARMANI : Gia Carangi Lived Here', text))['verdict'], 'exact')

    def test_listing_and_profile_pages(self):
        # fashiongonerogue model profile with a related-headline list; strip-project tag archive
        g = group('Tom Ford', 2025, models=['Julia Nobis'])
        text = 'Julia Nobis. Tom Ford Embraces Sleek Tailoring for Fall 2025 Campaign.'
        v = verify.assess(g, article('Julia Nobis – Fashion Gone Rogue', text,
                                     url='https://www.fashiongonerogue.com/models/julia-nobis/'))
        self.assertEqual(v['verdict'], 'reject')
        v = verify.assess(group('Mugler', 1989, models=['Naomi Campbell']),
                          article('ARCHIVE', 'MATHILDE | PARIS | 1989 | ROLLING STONE | THIERRY MUGLER campaign',
                                  url='https://strip-project.com/archive/tags/thierry-mugler/813.html'))
        self.assertEqual(v['verdict'], 'reject')


class Identity(unittest.TestCase):
    def test_other_first_name_with_same_surname(self):
        self.assertEqual(verify.model_hits(['Alyssa Miller'], 'Sienna Miller Vogue February 2006'), [])
        self.assertEqual(verify.model_hits(['Alyssa Miller'], 'Miller for Vogue'), ['Alyssa Miller'])

    def test_sub_line(self):
        self.assertEqual(verify._subline({'brand': 'Mango', 'title': None}, 'Mango Teen Embraces Parisian Style'), 'Mango Teen')

    def test_photographer_first_name_is_not_a_label(self):
        self.assertTrue(verify._person_name('Aldo', 'Photographer Aldo Fallai.'))


class Images(unittest.TestCase):
    def test_cover_image_from_another_issue(self):
        g = group('Vogue', 1986, kind='cover', title='April 1986 issue')
        self.assertEqual(verify._other_date(g, 'tatjana patitz by herb ritts vogue uk june 1988'), 'names another year')
        self.assertEqual(verify._other_date(g, 'vogue italia october 1986'), 'names another issue')

    def test_magazine_page_needs_label_caption(self):
        g = group('Carven', 2015, 'SS', models=['Magdalena Jasek'])
        art = article("Magdalena Jasek Stuns for Harper’s Bazaar Turkey", 'Magdalena Jasek wears Carven Spring 2015 campaign looks.',
                      images=[{'url': 'https://x/a.jpg', 'alt': 'The model has appeared in campaigns for brands like Valentino and Carven',
                               'caption': '', 'w': 0, 'h': 0, 'lead': False}])
        v = verify.assess(g, art)
        kept, _ = verify.pick_images(g, art, v, [verify.Brand('Valentino')])
        self.assertEqual(kept, [])

    def test_large_image_named_logo_is_kept(self):
        html = ('<html><head><title>Tom Ford Fall 2026 campaign</title></head><body><article><p>Text</p>'
                '<img width="1080" height="1350" src="https://x.com/AW26_1080x1350_LOGO_14.jpg" alt=""></article></body></html>')
        self.assertEqual(len(extract.read(html, 'https://x.com/a')['images']), 1)


class Reporting(unittest.TestCase):
    def test_failure_reason_comes_with_its_own_page(self):
        # D&G SS 2003: the reason "about FW 2003" was printed next to the URL of the SS 2003 page
        res = {'stages': [], 'pages': {
            'https://scans/d-g-ss-2003': {'status': 'ok', 'verdict': 'candidate', 'reason': 'none of the credited models is named', 'relevant': True},
            'https://scans/dolce-fw-2003': {'status': 'ok', 'verdict': 'candidate', 'reason': 'article is about FW 2003', 'relevant': True},
            'https://shop/dg-2003': {'status': 'ok', 'verdict': 'candidate', 'reason': 'article is about FW 2003', 'relevant': True}}}
        self.assertEqual(discover.classify(res), 'unverified: none of the credited models is named')
        self.assertEqual(res['failure_page'], 'https://scans/d-g-ss-2003')


if __name__ == '__main__':
    unittest.main()
