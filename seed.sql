/*
File: seed.sql
Author: Max Maehara
Last Edited: 2026-05-15

Description:
Initial inventory for Mehana Jewelry.

Image paths assume:
public/images/
*/

INSERT INTO products
(name, category, description, image_url)
VALUES

(
'Moana Necklace',
'necklaces',
'Two white freshwater pearls paired with a naturally sourced ocean shell.',
'images/moana_necklace.jpg'
),

(
'Mehana Necklace',
'necklaces',
'Six white freshwater pearls paired with a Hebrew cone shell.',
'images/mehana_necklace.jpg'
),

(
'Malie Necklace',
'necklaces',
'Three white freshwater pearls paired with a Hebrew cone shell.',
'images/malie_necklace.jpg'
),

(
'Lilikoi Necklace',
'necklaces',
'Five white freshwater pearls paired with a Hebrew cone shell.',
'images/lilikoi_necklace.jpg'
),

(
'Hau''oli Necklace',
'necklaces',
'Four pink freshwater pearls on an 18k gold-filled chain.',
'images/hauoli_necklace.jpg'
),

(
'Pikake Drop Necklace',
'necklaces',
'Three yellow pikake flower beads.',
'images/pikake_drop_necklace.jpg'
),

(
'Hanging Pikake Necklace',
'necklaces',
'Five white pikake flower beads.',
'images/hanging_pikake_necklace.jpg'
),

(
'Mini Pikake Necklace',
'necklaces',
'Three pikake flower beads.',
'images/mini_pikake_necklace.jpg'
),

(
'Hebrew Cone Shell Bangle',
'bangles',
'14k gold-filled wire bangle with Hebrew cone shell.',
'images/hebrew_cone_shell_bangle.jpg'
),

(
'Custom Shell Bangle',
'bangles',
'Custom shell bangle. Contact @mehana.jewelry for available shells.',
'images/custom_shell_bangle.jpg'
);

/* ==========================================================
OPTIONS
========================================================== */

INSERT INTO product_options
(product_id, option_type, option_value, price_cents, stock_quantity)
VALUES

/* Moana */
(1, 'Chain', '18k Gold Filled Chain', 7500, 3),

/* Mehana */
(2, 'Chain', '14k Gold Filled Figaro Chain', 9500, 1),

/* Malie */
(3, 'Chain', '18k Gold Filled Chain', 8000, 1),

/* Lilikoi */
(4, 'Chain', '14k Gold Filled Figaro Chain', 9500, 1),

/* Hauoli */
(5, 'Chain', '18k Gold Filled Chain', 7000, 5),

/* Pikake Drop */
(6, 'Pikake Color', 'Yellow', 5500, 5),

/* Hanging Pikake */
(7, 'Pikake Color', 'White', 5500, 3),

/* Mini Pikake */
(8, 'Pikake Color', 'White', 5500, 1),
(8, 'Pikake Color', 'Yellow', 5500, 1),

/* Hebrew Cone Shell Bangle */
(9, 'Size', '6.25', 7500, 2),
(9, 'Size', '6.50', 7500, 6),
(9, 'Size', '6.75', 7500, 1),

/* Custom Shell Bangle */
(10, 'Shell Type', 'Custom Shell', 7000, 999);



