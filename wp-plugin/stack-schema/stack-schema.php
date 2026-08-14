<?php
/**
 * Plugin Name: Stack Schema
 * Description: 自主輸出 Organization / LocalBusiness / Product 結構化資料（JSON-LD），不依賴 Yoast SEO。後台填一次品牌資料，全站自動印出；商品頁自動抓 WooCommerce 資料。
 * Version: 1.0.0
 * Author: 積木媒體行銷
 * Text Domain: stack-schema
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'STACK_SCHEMA_OPTION', 'stack_schema_settings' );

// ── 設定欄位定義（跟 stacktools 的 schema-check 生成工具同一套欄位，保持一致） ──

function stack_schema_org_fields() {
	return array(
		'org_enabled'   => array( 'type' => 'checkbox', 'label' => '啟用 Organization（品牌）Schema' ),
		'org_name'      => array( 'type' => 'text', 'label' => '名稱' ),
		'org_legalName' => array( 'type' => 'text', 'label' => '公司登記名稱' ),
		'org_vatID'     => array( 'type' => 'text', 'label' => '統一編號' ),
		'org_url'       => array( 'type' => 'url', 'label' => '網址（留空預設用網站首頁）' ),
		'org_logo'      => array( 'type' => 'url', 'label' => 'Logo 圖片網址（完整網址）' ),
		'org_telephone' => array( 'type' => 'text', 'label' => '電話' ),
		'org_email'     => array( 'type' => 'email', 'label' => 'Email' ),
		'org_description' => array( 'type' => 'textarea', 'label' => '簡介' ),
		'org_sameAs'    => array( 'type' => 'textarea', 'label' => '社群/外部連結（每行一個網址）' ),
	);
}

function stack_schema_localbiz_fields() {
	return array(
		'lb_enabled'          => array( 'type' => 'checkbox', 'label' => '啟用 LocalBusiness（在地商家）Schema' ),
		'lb_telephone'        => array( 'type' => 'text', 'label' => '電話' ),
		'lb_streetAddress'    => array( 'type' => 'text', 'label' => '街道地址' ),
		'lb_addressLocality'  => array( 'type' => 'text', 'label' => '縣市/區' ),
		'lb_postalCode'       => array( 'type' => 'text', 'label' => '郵遞區號' ),
		'lb_addressCountry'   => array( 'type' => 'text', 'label' => '國家代碼', 'placeholder' => 'TW' ),
		'lb_openingHours'     => array( 'type' => 'text', 'label' => '營業時間', 'placeholder' => 'Mo-Fr 09:00-18:00' ),
		'lb_priceRange'       => array( 'type' => 'text', 'label' => '價格區間', 'placeholder' => '$$' ),
	);
}

// ── 後台設定頁 ──

add_action( 'admin_menu', 'stack_schema_admin_menu' );
function stack_schema_admin_menu() {
	add_options_page( 'Schema 設定', 'Schema 設定', 'manage_options', 'stack-schema', 'stack_schema_render_settings_page' );
}

add_action( 'admin_init', 'stack_schema_register_settings' );
function stack_schema_register_settings() {
	register_setting( 'stack_schema_group', STACK_SCHEMA_OPTION, 'stack_schema_sanitize' );
}

function stack_schema_sanitize( $input ) {
	$out = array();
	$all_fields = array_merge( stack_schema_org_fields(), stack_schema_localbiz_fields() );
	foreach ( $all_fields as $key => $def ) {
		$raw = isset( $input[ $key ] ) ? $input[ $key ] : '';
		switch ( $def['type'] ) {
			case 'checkbox':
				$out[ $key ] = ! empty( $raw ) ? '1' : '';
				break;
			case 'url':
				$out[ $key ] = esc_url_raw( trim( $raw ) );
				break;
			case 'email':
				$out[ $key ] = sanitize_email( trim( $raw ) );
				break;
			case 'textarea':
				$out[ $key ] = sanitize_textarea_field( $raw );
				break;
			default:
				$out[ $key ] = sanitize_text_field( $raw );
		}
	}
	return $out;
}

function stack_schema_get_settings() {
	return wp_parse_args( get_option( STACK_SCHEMA_OPTION, array() ), array() );
}

function stack_schema_render_field( $key, $def, $settings ) {
	$value = isset( $settings[ $key ] ) ? $settings[ $key ] : '';
	$name  = STACK_SCHEMA_OPTION . '[' . $key . ']';
	echo '<tr><th scope="row"><label for="' . esc_attr( $key ) . '">' . esc_html( $def['label'] ) . '</label></th><td>';
	if ( $def['type'] === 'checkbox' ) {
		echo '<input type="checkbox" id="' . esc_attr( $key ) . '" name="' . esc_attr( $name ) . '" value="1" ' . checked( $value, '1', false ) . ' />';
	} elseif ( $def['type'] === 'textarea' ) {
		echo '<textarea id="' . esc_attr( $key ) . '" name="' . esc_attr( $name ) . '" rows="3" class="large-text">' . esc_textarea( $value ) . '</textarea>';
	} else {
		$placeholder = isset( $def['placeholder'] ) ? $def['placeholder'] : '';
		$type = $def['type'] === 'url' ? 'url' : ( $def['type'] === 'email' ? 'email' : 'text' );
		echo '<input type="' . esc_attr( $type ) . '" id="' . esc_attr( $key ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '" placeholder="' . esc_attr( $placeholder ) . '" class="regular-text" />';
	}
	echo '</td></tr>';
}

function stack_schema_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$settings = stack_schema_get_settings();
	?>
	<div class="wrap">
		<h1>Schema 設定</h1>
		<?php if ( is_plugin_active( 'wordpress-seo/wp-seo.php' ) ) : ?>
			<div class="notice notice-info"><p>偵測到 Yoast SEO 已啟用。Yoast 原本會自動輸出自己的一份 Organization/Person Schema，這個外掛啟用 Organization 後，已自動把 Yoast 那份拿掉、只保留這個外掛輸出的版本，Yoast 的其他功能（meta 標題描述、sitemap、麵包屑等）不受影響，不用手動去 Yoast 設定調整。</p></div>
		<?php endif; ?>
		<form method="post" action="options.php">
			<?php settings_fields( 'stack_schema_group' ); ?>
			<h2>Organization（品牌）</h2>
			<table class="form-table">
				<?php foreach ( stack_schema_org_fields() as $key => $def ) stack_schema_render_field( $key, $def, $settings ); ?>
			</table>
			<h2>LocalBusiness（在地商家）</h2>
			<p class="description">沒有實體門市（純線上品牌）不用開這個，留 Organization 就好。</p>
			<table class="form-table">
				<?php foreach ( stack_schema_localbiz_fields() as $key => $def ) stack_schema_render_field( $key, $def, $settings ); ?>
			</table>
			<?php if ( class_exists( 'WooCommerce' ) ) : ?>
				<h2>Product（商品）</h2>
				<p class="description">已偵測到 WooCommerce，商品頁的 Product Schema 會自動抓商品名稱/價格/庫存/圖片輸出，不用另外填。</p>
			<?php endif; ?>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

// ── 跟 Yoast SEO 共存：拿掉 Yoast 自動輸出的 Organization/Person 節點，避免跟這個外掛的版本打架 ──
// Yoast 其他 schema 節點（WebPage、BreadcrumbList、Article…）跟其他功能（meta、sitemap）完全不動，
// 只精準移除品牌身分這一塊，所以裝了這個外掛不用去 Yoast 後台調任何設定。
add_filter( 'wpseo_schema_graph_pieces', 'stack_schema_remove_yoast_organization', 11, 2 );
function stack_schema_remove_yoast_organization( $pieces, $context ) {
	$s = stack_schema_get_settings();
	if ( empty( $s['org_enabled'] ) || empty( $s['org_name'] ) ) return $pieces;

	return array_filter( $pieces, function ( $piece ) {
		return ! ( $piece instanceof Yoast\WP\SEO\Generators\Schema\Organization || $piece instanceof Yoast\WP\SEO\Generators\Schema\Person );
	} );
}

// ── 前台輸出 ──

add_action( 'wp_head', 'stack_schema_output_organization', 5 );
function stack_schema_output_organization() {
	$s = stack_schema_get_settings();
	if ( empty( $s['org_enabled'] ) || empty( $s['org_name'] ) ) return;

	$node = array(
		'@context' => 'https://schema.org',
		'@type'    => 'Organization',
		'name'     => $s['org_name'],
		'url'      => ! empty( $s['org_url'] ) ? $s['org_url'] : home_url( '/' ),
	);
	if ( ! empty( $s['org_legalName'] ) ) $node['legalName'] = $s['org_legalName'];
	if ( ! empty( $s['org_vatID'] ) ) { $node['vatID'] = $s['org_vatID']; $node['taxID'] = $s['org_vatID']; }
	if ( ! empty( $s['org_logo'] ) ) $node['logo'] = $s['org_logo'];
	if ( ! empty( $s['org_telephone'] ) ) $node['telephone'] = $s['org_telephone'];
	if ( ! empty( $s['org_email'] ) ) $node['email'] = $s['org_email'];
	if ( ! empty( $s['org_description'] ) ) $node['description'] = $s['org_description'];
	$sameAs = stack_schema_lines_to_array( $s['org_sameAs'] ?? '' );
	if ( $sameAs ) $node['sameAs'] = $sameAs;

	stack_schema_print_jsonld( $node );
}

add_action( 'wp_head', 'stack_schema_output_localbusiness', 6 );
function stack_schema_output_localbusiness() {
	$s = stack_schema_get_settings();
	if ( empty( $s['lb_enabled'] ) || empty( $s['org_name'] ) ) return;

	$node = array(
		'@context' => 'https://schema.org',
		'@type'    => 'LocalBusiness',
		'name'     => $s['org_name'],
		'url'      => ! empty( $s['org_url'] ) ? $s['org_url'] : home_url( '/' ),
	);
	if ( ! empty( $s['lb_telephone'] ) ) $node['telephone'] = $s['lb_telephone'];
	if ( ! empty( $s['lb_openingHours'] ) ) $node['openingHours'] = $s['lb_openingHours'];
	if ( ! empty( $s['lb_priceRange'] ) ) $node['priceRange'] = $s['lb_priceRange'];
	if ( ! empty( $s['org_logo'] ) ) $node['image'] = $s['org_logo'];

	$address = array_filter( array(
		'@type'           => 'PostalAddress',
		'streetAddress'   => $s['lb_streetAddress'] ?? '',
		'addressLocality' => $s['lb_addressLocality'] ?? '',
		'postalCode'      => $s['lb_postalCode'] ?? '',
		'addressCountry'  => $s['lb_addressCountry'] ?? '',
	) );
	if ( count( $address ) > 1 ) $node['address'] = $address;

	stack_schema_print_jsonld( $node );
}

// WooCommerce 商品頁：資料全部從商品物件抓，不用另外維護一份
add_action( 'wp_head', 'stack_schema_output_product', 7 );
function stack_schema_output_product() {
	if ( ! class_exists( 'WooCommerce' ) || ! function_exists( 'is_product' ) || ! is_product() ) return;
	global $product;
	if ( ! $product || ! is_a( $product, 'WC_Product' ) ) return;

	$availability_map = array(
		'instock'     => 'https://schema.org/InStock',
		'outofstock'  => 'https://schema.org/OutOfStock',
		'onbackorder' => 'https://schema.org/BackOrder',
	);

	$node = array(
		'@context'    => 'https://schema.org',
		'@type'       => 'Product',
		'name'        => $product->get_name(),
		'description' => wp_strip_all_tags( $product->get_short_description() ?: $product->get_description() ),
		'sku'         => $product->get_sku(),
		'url'         => get_permalink( $product->get_id() ),
		'offers'      => array_filter( array(
			'@type'         => 'Offer',
			'price'         => $product->get_price(),
			'priceCurrency' => get_woocommerce_currency(),
			'availability'  => $availability_map[ $product->get_stock_status() ] ?? 'https://schema.org/InStock',
			'url'           => get_permalink( $product->get_id() ),
		) ),
	);

	$image_id = $product->get_image_id();
	if ( $image_id ) {
		$image_url = wp_get_attachment_image_url( $image_id, 'full' );
		if ( $image_url ) $node['image'] = $image_url;
	}

	stack_schema_print_jsonld( array_filter( $node, function ( $v ) { return $v !== '' && $v !== null; } ) );
}

// ── 共用工具 ──

function stack_schema_lines_to_array( $raw ) {
	$lines = array_filter( array_map( 'trim', explode( "\n", (string) $raw ) ) );
	return array_values( $lines );
}

function stack_schema_print_jsonld( $node ) {
	echo "\n<script type=\"application/ld+json\">" . wp_json_encode( $node, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n";
}
