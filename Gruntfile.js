/**
 * Gruntfile
 * 打包合并配置文件
 */
module.exports = function (grunt){
    var path = require('path'),
        UglifyJS = require('uglify-js'),
        cmd = require('./tools/grunt-tasks/cmd-util'),
        debugfile = true,
        scriptDeploy = require('./tools/grunt-tasks/deploy/lib/script').init(grunt),
        combine = scriptDeploy.combine,
        modify = scriptDeploy.modify,
        configAst = UglifyJS.parse(grunt.file.read('script/config.js')),
        pkg = {alias: getAlias(configAst)},
        excludes = [pkg.alias['$']],
        linefeed = grunt.util.linefeed,
        CSSBanner = [
            '/*!',
            ' * Project: CSS Assets',
            ' * Author: newton',
            ' * Date: <%= grunt.template.today("yyyy-mm-dd") %>',
            ' */'
        ].join(linefeed),
        JSBanner = [
            '/*!',
            ' * Project: JS Assets',
            ' * Author: newton',
            ' * Date: <%= grunt.template.today("yyyy-mm-dd") %>',
            ' */'
        ].join(linefeed);

    // 通过config.js获取alias
    function getAlias(ast){
        var alias = {},
            walker = new UglifyJS.TreeWalker(function (node, descend){
                if (node instanceof UglifyJS.AST_Call && node.start.value === 'seajs' && node.expression.property === 'config' && node.args.length) {
                    node.args[0].properties.forEach(function (node){
                        if (node.key === 'alias') {
                            node.value.properties.forEach(function (node){
                                alias[node.key] = node.value.value;
                            });
                        }
                    });
                }
            });

        ast.walk(walker);

        return alias;
    }

    // 获取线上配置文件config.js
    function getConfig(ast){
        var trans = new UglifyJS.TreeTransformer(function (node, descend){
            if (node instanceof UglifyJS.AST_Call && node.start.value === 'seajs' && node.expression.property === 'config' && node.args.length) {
                node.args[0].properties = node.args[0].properties.filter(function (node){
                    return node.key !== 'alias';
                });
                return node;
            }
        });

        return ast.transform(trans).print_to_string({ beautify: true, comments: true });
    }

    // 获取整站公用脚本common.js
    function getCommon(fpath, excludes){
        var modules = [],
            common = combine(fpath, {
                librarys: '.librarys',
                root: 'script',
                excludes: Array.isArray(excludes) ? excludes : []
            }).join(linefeed);

        // 获取公共脚本总已经包含的模块，页面脚本要排除
        cmd.ast.parse(common).forEach(function (meta){
            modules.push(meta.id);
        });

        return {
            modules: modules,
            code: common
        };
    }

    // 初始化seajs环境
    grunt.registerTask('seajs', 'Initialize the seajs environment.', function (){
        grunt.log.write('>> '.green + 'Initializing seajs environment'.cyan + ' ...' + linefeed);
        // move seajs
        grunt.file.recurse('script', function (fpath, root){
            fpath = fpath.replace(/\\/g, '/');
            if (/\/sea\.js$/i.test(fpath)) {
                var seajs = grunt.file.read(fpath),
                    config = getConfig(configAst),
                    common = getCommon('.librarys/script/view/common.js'),
                    combo = seajs + linefeed + config + linefeed + common.code,
                    now = new Date(), // 当前时间对象
                    banner = [
                        '/*!',
                        ' * Sea.js ' + path.dirname(fpath).split('/').pop() + ' | seajs.org/LICENSE.md',
                        ' * Author: lifesinger & newton',
                        ' * Date: ' + now.toISOString().replace(/(\d+-\d+-\d+).+/, '$1'),
                        ' */'
                    ].join(linefeed), // banner
                    minify = UglifyJS.minify(combo, {
                        outSourceMap: '{{file}}',
                        fromString: true,
                        warnings: grunt.option('verbose')
                    }), // minify code
                    code = [
                        banner,
                        minify.code
                    ].join(linefeed);

                // 排除common.js中已经包含的模块
                excludes = excludes.concat(common.modules);

                fpath = path.join('js', path.relative(root, fpath)).replace(/\\/g, '/');

                if (debugfile) {
                    // add source map url
                    code += '/*' + linefeed
                        + '//@ sourceMappingURL=sea.js.map' + linefeed
                        + '*/';
                }

                // 生成sea.js
                grunt.file.write(fpath, code);

                if (debugfile) {
                    // 生成sea.js.map
                    var map = minify.map
                        .replace('"file":"{{file}}"', '"file":"sea.js"')
                        .replace('"sources":["?"]', '"sources":["sea-debug.js"]'); // source map
                    grunt.file.write(fpath + '.map', map);
                    // 生成sea-debug.js
                    grunt.file.write(fpath.replace(/\.js$/i, '-debug.js'), modify(combo, {'.js': true, '.css': true}));
                }
            }
            grunt.file.copy(fpath, path.join('js', path.relative(root, fpath)).replace(/\\/g, '/'));
        }, 'seajs');

        grunt.log.write('>> '.green + 'Initialize seajs environment'.cyan + ' ...').ok();
    });

    // 修复css中图片路径
    grunt.registerTask('fixcss', 'Fix css resource path.', function (){
        grunt.log.write('>> '.green + 'Fixing css htc path'.cyan + ' ...' + grunt.util.linefeed);
        grunt.file.recurse('.librarys', function (fpath){
            if (!grunt.file.isFile(fpath)) return;
            fpath = fpath.replace(/\\/g, '/');
            if (!/\.css$/i.test(path.basename(fpath))) return;
            var code = grunt.file.read(fpath);
            code = code.replace(/\s*\/Res\/style\//img, '/Res/css/');
            grunt.file.write(fpath, code);
        });
        grunt.log.write('>> '.green + 'Fix css resource path'.cyan + ' ...').ok();
    });

    // 初始化构建配置
    grunt.initConfig({
        // 转换
        transport: {
            options: {
                pkg: pkg,
                root: 'script'
            },
            base: {
                options: {
                    family: 'base'
                },
                files: [
                    {
                        cwd: 'script/base',
                        src: ['**/*'],
                        filter: 'isFile'
                    }
                ]
            },
            util: {
                options: {
                    family: 'util'
                },
                files: [
                    {
                        cwd: 'script/util',
                        src: ['**/*'],
                        filter: 'isFile'
                    }
                ]
            },
            common: {
                options: {
                    family: 'common'
                },
                files: [
                    {
                        cwd: 'script/common',
                        src: ['**/*'],
                        filter: 'isFile'
                    }
                ]
            },
            view: {
                options: {
                    family: 'view'
                },
                files: [
                    {
                        cwd: 'script/view',
                        src: ['**/*'],
                        filter: 'isFile'
                    }
                ]
            },
            css: {
                options: {
                    root: 'style',
                    family: 'default'
                },
                files: [
                    {
                        cwd: 'style/default',
                        src: ['**/*'],
                        filter: 'isFile'
                    }
                ]
            },
            htc: {
                options: {
                    root: 'style',
                    family: 'css3pie'
                },
                files: [
                    {
                        cwd: 'style/css3pie',
                        src: ['**/*'],
                        filter: 'isFile'
                    }
                ]
            }
        },
        // 发布
        deploy: {
            options: {
                pkg: pkg,
                root: 'script',
                banner: JSBanner,
                include: '*',
                excludes: function (){
                    return excludes;
                },
                debugfile: debugfile
            },
            // 非脚本文件处理
            other: {
                options: {
                    include: 'default'
                },
                files: [
                    {
                        cwd: '.librarys/script',
                        src: ['**/*'],
                        /**
                         * 文件过滤
                         * @param file
                         * @returns {*}
                         */
                        filter: function (file){
                            if (grunt.file.isFile(file)) {
                                file = file.replace(/\\/g, '/');
                                var basename = path.basename(file);
                                if (!(/\.js$/i.test(basename) && /\/script\/view\//.test(file))) {
                                    return file;
                                }
                            }
                        }
                    }
                ]
            },
            // 页面视图脚本
            view: {
                files: [
                    {
                        cwd: '.librarys/script/view',
                        src: ['**/*'],
                        /**
                         * 文件过滤
                         * @param file
                         * @returns {*}
                         */
                        filter: function (file){
                            if (!grunt.file.isFile(file)) return;
                            if (!/common\.js$/i.test(path.basename(file))) return file;
                        }
                    }
                ]
            },
            // 站点样式
            css: {
                options: {
                    root: 'style',
                    output: 'css',
                    banner: CSSBanner
                },
                files: [
                    {
                        cwd: '.librarys/style',
                        src: ['**/*'],
                        /**
                         * 文件过滤
                         * @param file
                         * @returns {*}
                         */
                        filter: function (file){
                            if (!grunt.file.isFile(file)) return;
                            if (!/[/\\]common\.css$/i.test(file) && !/[/\\]+widget[/\\]+/.test(file)) return file;
                        }
                    }
                ]
            }
        },
        // 清理
        clean: {
            librarys: {
                options: {
                    force: true
                },
                src: ['.librarys']
            }
        }
    });

    // 加载构建任务
    grunt.loadTasks('tools/grunt-tasks/transport');
    grunt.loadTasks('tools/grunt-tasks/deploy');
    grunt.loadTasks('tools/grunt-tasks/clean');
    grunt.registerTask('default', ['transport', 'fixcss', 'seajs', 'deploy', 'clean']);
};
