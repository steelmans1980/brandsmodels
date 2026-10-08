"""Command line for the image pipeline.

  python3 -m pipeline audit                     coverage and failure audit -> pipeline/results/audit.{json,md}
  python3 -m pipeline batch --run NAME [...]    process groups (resumable; cached; budgeted)
  python3 -m pipeline trial --n 50 --budget 5   controlled comparison on 50 dated campaigns (Brave arm)
  python3 -m pipeline trial --google            Google Images arm on the same 50 (SerpApi plan allowance only, <= 50 searches)
  python3 -m pipeline compare                   Brave vs Google on the trial campaigns, plus a contact sheet
  python3 -m pipeline sheet --run NAME          contact sheet of accepted photos for review
  python3 -m pipeline apply --run NAME          add accepted photos to data/campaigns.json
  python3 -m pipeline general                   re-check photos on undated (general) relationships
  python3 -m pipeline validate                  check that every referenced image file renders

Paid searches run only with --providers including brave_web / brave_images / serpapi_google_images
and a --budget above zero. --dry-run never pays: it uses cached responses and lists what it would query.
"""
import argparse
import sys

from . import runner


def main(argv=None):
    ap = argparse.ArgumentParser(prog='python3 -m pipeline', description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)

    a = sub.add_parser('audit')
    a.add_argument('--offline', action='store_true', help='use cached pages only')

    b = sub.add_parser('batch')
    b.add_argument('--run', required=True, help='run name; results are stored under it and the run resumes')
    b.add_argument('--providers', default='sources,legacy', help='comma list: sources,legacy,brave_web,brave_images,serpapi_google_images')
    b.add_argument('--budget', type=float, default=0.0, help='US dollars of new paid requests allowed in this run')
    b.add_argument('--limit', type=int, default=0)
    b.add_argument('--kinds', default='campaign,ambassador,cover,runway')
    b.add_argument('--ids', help='file with one group id per line')
    b.add_argument('--include-illustrated', action='store_true', help='also process groups that already have photos')
    b.add_argument('--dry-run', action='store_true')
    b.add_argument('--redo', action='store_true', help='ignore stored results for this run')
    b.add_argument('--workers', type=int, default=8)

    t = sub.add_parser('trial')
    t.add_argument('--n', type=int, default=50)
    t.add_argument('--budget', type=float, default=5.0)
    t.add_argument('--dry-run', action='store_true')
    t.add_argument('--google', action='store_true', help='run the Google Images (SerpApi) arm within the plan allowance')
    t.add_argument('--plans', default='free', help='SerpApi plans allowed to run, e.g. free,starter (only searches the month still includes)')
    t.add_argument('--max-searches', type=int, default=50, help='hard cap on new SerpApi searches for --google')
    t.add_argument('--reselect', action='store_true', help='draw a new set of campaigns instead of the frozen one')
    t.add_argument('--redo', action='store_true', help='re-evaluate stored results (cached searches are not paid again)')

    gb = sub.add_parser('gbatch', help='Google-first batch within fixed SerpApi and Brave caps')
    gb.add_argument('--run', required=True)
    gb.add_argument('--n', type=int, default=100)
    gb.add_argument('--max-searches', type=int, default=200, help='hard cap on SerpApi searches started')
    gb.add_argument('--brave-budget', type=float, default=1.0, help='hard cap on Brave web spend, USD')
    gb.add_argument('--plans', default='starter')
    gb.add_argument('--reserve', type=int, default=500, help='SerpApi searches that must stay unused this month')
    gb.add_argument('--workers', type=int, default=4)
    gb.add_argument('--dry-run', action='store_true')
    gb.add_argument('--reselect', action='store_true')
    gb.add_argument('--redo', action='store_true')

    rs = sub.add_parser('review-sheet', help='HTML contact sheet with attribution evidence')
    rs.add_argument('--run', required=True)
    rs.add_argument('--ids', help='file of group ids to include')

    s = sub.add_parser('sheet')
    s.add_argument('--run', required=True)

    p = sub.add_parser('apply')
    p.add_argument('--run', required=True, action='append')
    p.add_argument('--reject', help='file of photo paths rejected in review (one per line)')
    p.add_argument('--dry-run', action='store_true')

    g = sub.add_parser('general')
    g.add_argument('--dry-run', action='store_true')

    r = sub.add_parser('recheck', help='keep model tags on published photos only with image-specific evidence')
    r.add_argument('--dry-run', action='store_true')
    r.add_argument('--workers', type=int, default=12)

    sub.add_parser('validate')
    sub.add_parser('compare', help='Brave vs Google arm on the frozen trial campaigns')

    args = ap.parse_args(argv)
    return getattr(runner, 'cmd_' + args.cmd.replace('-', '_'))(args)


if __name__ == '__main__':
    sys.exit(main())
