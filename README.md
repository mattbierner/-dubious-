## {{Dubious}}

Script for extracting all uses of a given [inline cleanup template][inline] (such as 'dubious' or 'citation-needed' or 'lopsided') from Wikipedia.

Examples of `lopsided` statements. The star represents where the template is used (`lopsided` in this case):

```
=====Raw foodism=====
- In November 1897, he opened a sanatorium in Zurich called "Vital Force," named after a "key term from the German lifestyle reform movement, which states that people should pattern their lives after the logic determined by nature".*
- Price claimed that the parents of such first-generation children had excellent jaw development and dental health, while their children had malocclusion and tooth decay and attributed this to their new modern diet insufficient in nutrients.*
- The book advocates a diet of 75% raw food which it claims will prevent degenerative diseases, slow the effects of aging, provide enhanced energy, and boost emotional balance.*

=====Cali=====
- It comes from the neighboring mountains, and refreshes souls* and bodies.
- With the large facilities providing complete amenities, Caleños love just taking walks in them, enjoying the fact* that everything is at hand.
- Certainly,* bargains will not be found in most of these malls.

=====Hookup culture=====
- The American Academy of Pediatrics has argued that media representations of sexuality may influence teen sexual behavior, and this view is supported by a number of studies.*

=====Gibraltar Hill (Bungendore, New South Wales)=====
- The Capital Wind Farm at Bungendore is visible from the hill, and, according to Australian naval officer Stacey Porter, the view makes "a really nice outlook."*

=====Psychopathography of Adolf Hitler=====
- Hitler regularly consumed methamphetamine, barbiturates, amphetamine, opiates and cocaine.*

=====Kyoto Protocol and government action=====
- According to the Guardian, "Canada's inaction was blamed by some on its desire to protect the lucrative but highly polluting exploitation of tar sands, the second biggest oil reserve in the world."*
- The Administration's position was not uniformly accepted in the US* For example, economist Paul Krugman noted that the target 18% reduction in carbon intensity is still actually an increase in overall emissions.

=====Community colleges in the United States=====
- However, key Republican lawmakers, including John Boehner (a key proponent of for-profit colleges) *  and Mitch McConnell publicly opposed the legislation.
```

"refreshes souls*". Amazing! The [rest of the Cali article](https://en.wikipedia.org/wiki/Cali) is similarly hilarious. 

The tool is great for finding entertaining pages on Wikipedia like this.

## Usage

```bash
$ npm install
```

The main script is `index.js`. This incrementally finds usage of a given template and writes them to `out`:

```bash
$ node index.js 'citation-needed'
```

For best results, make sure the template name is listed in `templateAliases`, which gives an alternate set of names for how a template may be used in Wikipedia ([see Wikpedia's inline template documentation][inline] for some template and alias ideas).

Results are saved using [NeDB][nedb] to `output/TEMPLATE_NAME`.


[inline]: https://en.wikipedia.org/wiki/Category:Inline_cleanup_templates
[search_api]: https://www.mediawiki.org/wiki/API:Search

[nedb]: https://github.com/louischatriot/nedb