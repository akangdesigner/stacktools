<?php
/**
 * Plugin Name: Stack Schema
 * Description: 自主輸出品牌/商家結構化資料（JSON-LD），不依賴 Yoast SEO。後台直接貼 JSON-LD 存檔即可全站輸出；商品頁自動抓 WooCommerce 資料。
 * Version: 1.2.2
 * Author: 積木媒體行銷
 * Text Domain: stack-schema
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'STACK_SCHEMA_OPTION', 'stack_schema_settings' );

// ── 後台設定頁 ──
// 不做逐欄位表單，直接貼 stacktools「schema-check」工具「生成/補完」產生的那段 JSON-LD——
// 一份資料只維護一次，不用在這裡跟工具的表單欄位保持同步。

add_action( 'admin_menu', 'stack_schema_admin_menu' );
function stack_schema_admin_menu() {
	add_options_page( 'Schema 設定', 'Schema 設定', 'manage_options', 'stack-schema', 'stack_schema_render_settings_page' );
}

add_action( 'admin_init', 'stack_schema_register_settings' );
function stack_schema_register_settings() {
	register_setting( 'stack_schema_group', STACK_SCHEMA_OPTION, 'stack_schema_sanitize' );
}

// 存檔前驗證是不是合法 JSON，不合法就擋下來不存、顯示錯誤，避免存進一段壞掉的 JSON 讓全站 schema 掛掉
function stack_schema_sanitize( $input ) {
	$raw = isset( $input['org_json'] ) ? trim( wp_unslash( $input['org_json'] ) ) : '';
	if ( $raw === '' ) return array( 'org_json' => '' );

	$decoded = json_decode( $raw, true );
	if ( json_last_error() !== JSON_ERROR_NONE || ! is_array( $decoded ) ) {
		add_settings_error( STACK_SCHEMA_OPTION, 'stack_schema_invalid_json', 'JSON 格式錯誤，沒有存檔：' . json_last_error_msg() . '，請檢查後再貼一次。' );
		return stack_schema_get_settings();
	}
	if ( empty( $decoded['@context'] ) ) $decoded['@context'] = 'https://schema.org';

	return array( 'org_json' => wp_json_encode( $decoded, JSON_UNESCAPED_UNICODE ) );
}

function stack_schema_get_settings() {
	return wp_parse_args( get_option( STACK_SCHEMA_OPTION, array() ), array( 'org_json' => '' ) );
}

function stack_schema_render_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$settings = stack_schema_get_settings();
	settings_errors( STACK_SCHEMA_OPTION );
	?>
	<div class="wrap">
		<h1>Schema 設定</h1>
		<?php if ( is_plugin_active( 'wordpress-seo/wp-seo.php' ) ) : ?>
			<div class="notice notice-info"><p>已自動停用 Yoast SEO 的品牌 Schema 輸出，避免與下方設定重複。</p></div>
		<?php endif; ?>
		<form method="post" action="options.php">
			<?php settings_fields( 'stack_schema_group' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><label for="stack_schema_org_json">品牌 / 商家 JSON-LD</label></th>
					<td>
						<textarea id="stack_schema_org_json" name="<?php echo esc_attr( STACK_SCHEMA_OPTION ); ?>[org_json]" rows="16" class="large-text code" placeholder='{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "..."
}'><?php echo esc_textarea( $settings['org_json'] ); ?></textarea>
						<p class="description">貼上完整 JSON-LD（需含 <code>@context</code> 與 <code>@type</code>）。</p>
					</td>
				</tr>
			</table>
			<?php if ( class_exists( 'WooCommerce' ) ) : ?>
				<h2>Product（商品）</h2>
				<p class="description">已偵測到 WooCommerce，商品頁會自動輸出 Product Schema。</p>
			<?php endif; ?>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

// ── 跟 Yoast SEO 共存：拿掉 Yoast 自動輸出的 Organization/Person 節點，避免跟這裡貼的版本打架 ──
// Yoast 其他 schema 節點（WebPage、BreadcrumbList、Article…）跟其他功能（meta、sitemap）完全不動，
// 只精準移除品牌身分這一塊，所以裝了這個外掛不用去 Yoast 後台調任何設定。
add_filter( 'wpseo_schema_graph_pieces', 'stack_schema_remove_yoast_organization', 11, 2 );
function stack_schema_remove_yoast_organization( $pieces, $context ) {
	$s = stack_schema_get_settings();
	if ( empty( $s['org_json'] ) ) return $pieces;

	return array_filter( $pieces, function ( $piece ) {
		return ! ( $piece instanceof Yoast\WP\SEO\Generators\Schema\Organization || $piece instanceof Yoast\WP\SEO\Generators\Schema\Person );
	} );
}

// ── 前台輸出 ──

add_action( 'wp_head', 'stack_schema_output_business_entity', 5 );
function stack_schema_output_business_entity() {
	$s = stack_schema_get_settings();
	if ( empty( $s['org_json'] ) ) return;
	$decoded = json_decode( $s['org_json'], true );
	if ( ! is_array( $decoded ) ) return; // 資料庫裡的值已經是存檔時驗證過的合法 JSON，這裡只是防禦性檢查

	// 補上 @id，沿用 Yoast 原本幫 Organization 節點取的同一個 id（網址 + #organization）。
	// Yoast 的 WebPage/WebSite 節點裡還留著指向這個 id 的 about/publisher 參照（Organization 本體
	// 已被上面的 filter 拿掉），補這個 id 讓那些參照接回我們自己輸出的節點，不會變成斷掉的連結。
	if ( empty( $decoded['@id'] ) ) $decoded['@id'] = home_url( '/' ) . '#organization';

	stack_schema_print_jsonld( $decoded );
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

// "</script" 若原樣出現在字串值裡（如簡介文字剛好寫到這幾個字），會提早關閉這個 script 標籤，
// 讓後面的 JSON 變成裸露在頁面上的文字——輸出前一律轉義擋掉，跟資料是不是使用者貼的無關，一律做
function stack_schema_print_jsonld( $node ) {
	$json = wp_json_encode( $node, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
	$json = str_replace( '</', '<\/', $json );
	echo "\n<script type=\"application/ld+json\">" . $json . "</script>\n";
}
